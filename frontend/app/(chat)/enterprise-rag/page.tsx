"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { streamChat } from "@/lib/stream";
import { ChatMessage, Conversation, RagSource } from "@/types";
import SessionList from "@/components/chat/session-list";
import ChatPanel from "@/components/chat/chat-panel";
import SourceCard from "@/components/chat/source-card";
import { LogOut, Building2, PanelRightOpen, PanelRightClose, ArrowLeft } from "lucide-react";

function EnterpriseRagInner() {
  const router = useRouter();
  const { hasPermission, loading: authLoading } = useAuth();
  const [ready, setReady] = useState(false);

  // Session state
  const [sessions, setSessions] = useState<Conversation[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // 跟踪所有活跃流式请求的会话 ID 集合
  const activeStreamSessionsRef = useRef<Set<string>>(new Set());
  // 每个会话的后台流式内容（key=sessionId），用于用户切回时恢复
  const streamContentMapRef = useRef<Map<string, string>>(new Map());
  // 跟踪当前显示的会话 ID，供流式循环闭包内读取最新值
  const currentSessionIdRef = useRef<string | null>(null);
  useEffect(() => { currentSessionIdRef.current = sessionId; }, [sessionId]);
  // 新对话计数器，用于隔离多个"新对话"视图的流
  const newViewCounterRef = useRef(0);
  // 每个活跃流的用户问题，用于切回时补回消息列表（后端流完成后才保存）
  const streamQuestionMapRef = useRef<Map<string, string>>(new Map());

  // 流式会话 ID 集合（用于 UI 渲染，SessionList 中显示旋转动画）
  const [streamingSessionIds, setStreamingSessionIds] = useState<Set<string>>(new Set());
  // 有未读消息的会话 ID 集合（后台流完成后标记，点击进入后清除）
  const [unreadSessions, setUnreadSessions] = useState<Set<string>>(new Set());

  // Streaming state
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  // Sources
  const [sources, setSources] = useState<RagSource[]>([]);
  const [activeSource, setActiveSource] = useState<number | null>(null);
  const [showSources, setShowSources] = useState(true);

  // KB selector state
  const [kbList, setKbList] = useState<{id:string;name:string}[]>([]);
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>([]);

  useEffect(() => {
    if (authLoading) return;
    if (!hasPermission("query_knowledge_base")) { router.push("/dashboard"); return; }
    setReady(true);
    loadSessions();
    loadKBs();
  }, [router, authLoading, hasPermission]);

  const loadSessions = async () => {
    try {
      const data = await apiGet<{items: Conversation[], total: number}>("/api/sessions?kb_type=enterprise");
      setSessions(data.items || []);
    } catch {}
  };

  const loadKBs = async () => {
    try {
      const data = await apiGet<{id:string;name:string;type:string}[]>("/api/knowledge-bases/accessible");
      setKbList(data);
    } catch {}
  };

  const handleKbToggle = (kbId: string) => {
    if (kbId === "__all__") {
      setSelectedKbIds([]);
    } else {
      setSelectedKbIds(prev =>
        prev.includes(kbId) ? prev.filter(id => id !== kbId) : [...prev, kbId]
      );
    }
  };

  const loadSession = useCallback(async (id: string) => {
    try {
      const data = await apiGet<any>(`/api/sessions/${id}`);
      setSessionId(id);
      setMessages(data.messages || []);
      const last = data.messages?.filter((m: any) => m.role === "assistant").pop();
      setSources(last?.sources || []);
      // 清除该会话的未读标记
      setUnreadSessions(prev => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      // 如果切换到的会话有活跃流，恢复流式状态；否则重置
      if (activeStreamSessionsRef.current.has(id)) {
        // 确保用户问题在消息列表中（后端流完成后才保存，此时可能尚未入库）
        let msgs = data.messages || [];
        const question = streamQuestionMapRef.current.get(id);
        if (question && !msgs.some((m: any) => m.role === "user" && m.content === question)) {
          msgs = [...msgs, { id: `local_${Date.now()}`, role: "user" as const, content: question, created_at: new Date().toISOString() }];
        }
        setMessages(msgs);
        setStreaming(true);
        setStreamContent(streamContentMapRef.current.get(id) || "");
        setStatusMsg("");
      } else {
        setStreaming(false);
        setStreamContent("");
        setStatusMsg("");
      }
    } catch {}
  }, []);

  const handleNew = () => {
    newViewCounterRef.current += 1;
    setStreaming(false);
    setSessionId(null);
    setMessages([]);
    setSources([]);
    setStreamContent("");
    setStatusMsg("");
  };

  const handleDelete = async (id: string) => {
    await apiDelete(`/api/sessions/${id}`);
    if (sessionId === id) handleNew();
    loadSessions();
  };

  const handleSend = async (question: string) => {
    const sid = sessionId;
    const streamKey = sid || `__new__${newViewCounterRef.current}`;
    const myGeneration = newViewCounterRef.current;

    // 全局并发限制
    const MAX_CONCURRENT = 3;
    if (activeStreamSessionsRef.current.size >= MAX_CONCURRENT) {
      alert(`已达到最大并发数（${MAX_CONCURRENT}个），请等待其他请求完成`);
      return;
    }
    // 同一会话已有活跃流
    if (activeStreamSessionsRef.current.has(streamKey)) return;

    // 注册此流
    activeStreamSessionsRef.current.add(streamKey);
    streamContentMapRef.current.set(streamKey, "");
    streamQuestionMapRef.current.set(streamKey, question);
    setStreamingSessionIds(prev => new Set(prev).add(streamKey));

    const isActive = () => {
      if (sid) return currentSessionIdRef.current === sid;
      return currentSessionIdRef.current === null && newViewCounterRef.current === myGeneration;
    };

    if (isActive()) {
      setStreaming(true);
      setStreamContent("");
      setStatusMsg("正在处理...");
    }

    // Add user message locally
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: question,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    let fullContent = "";
    let finalSources: RagSource[] = [];
    let finalSessionId = sessionId;

    try {
      for await (const event of streamChat("/api/enterprise-rag/chat/stream", {
        question,
        top_k: 7,
        session_id: sessionId || undefined,
        knowledge_base_ids: selectedKbIds.length > 0 ? selectedKbIds : undefined,
      })) {
        switch (event.type) {
          case "status":
            if (isActive()) setStatusMsg(event.message || "");
            break;
          case "answer":
            fullContent += event.content || "";
            streamContentMapRef.current.set(streamKey, fullContent);
            if (isActive()) {
              setStreamContent(fullContent);
              setStatusMsg("");
            }
            break;
          case "sources":
            finalSources = (event as any).content || [];
            if (isActive()) setSources(finalSources);
            break;
          case "done":
            if (event.session_id) finalSessionId = event.session_id;
            break;
          case "error":
            fullContent = `错误: ${event.content || event.error || "未知错误"}`;
            streamContentMapRef.current.set(streamKey, fullContent);
            if (isActive()) {
              setStatusMsg("");
              setStreamContent(fullContent);
            }
            break;
        }
      }
    } catch (e: any) {
      fullContent = `请求失败: ${e.message}`;
      streamContentMapRef.current.set(streamKey, fullContent);
      if (isActive()) setStreamContent(fullContent);
    }

    // 仅当用户仍在发起流时的会话中时，才追加消息到当前列表
    if (isActive()) {
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: fullContent || "无响应",
        sources: finalSources,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setStreaming(false);
      setStatusMsg("");
    }

    // 清理此流的追踪
    activeStreamSessionsRef.current.delete(streamKey);
    streamContentMapRef.current.delete(streamKey);
    streamQuestionMapRef.current.delete(streamKey);
    setStreamingSessionIds(prev => {
      const next = new Set(prev);
      next.delete(streamKey);
      return next;
    });

    // Update session
    if (isActive() && finalSessionId && finalSessionId !== sessionId) {
      setSessionId(finalSessionId);
      loadSessions();
    }
    // 即使用户已切走，也刷新会话列表并标记未读（后端已保存消息）
    if (!isActive()) {
      loadSessions();
      const resultId = finalSessionId || sid;
      if (resultId) {
        setUnreadSessions(prev => new Set(prev).add(resultId));
      }
    }
  };

  const handleFeedback = async (messageId: string, rating: string, reason: string) => {
    await apiPost(`/api/sessions/messages/${messageId}/feedback`, { rating, reason });
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, rating, rating_reason: reason } : m
    ));
  };

  const handleSourceHover = (index: number | null) => {
    setActiveSource(index);
  };

  if (!ready) return null;

  return (
    <div className="flex h-screen bg-white">
      {/* Left: Session List */}
      <div className="hidden w-[260px] shrink-0 md:block">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b px-3 py-3">
            <div className="flex items-center gap-2">
              <button onClick={() => router.push("/dashboard")} className="rounded p-1 text-gray-400 hover:text-gray-600" title="返回工作台">
                <ArrowLeft size={16} />
              </button>
              <Building2 size={18} className="text-[var(--color-accent)]" />
              <span className="text-sm font-semibold text-gray-800">企业 RAG</span>
            </div>
            <button
              onClick={() => {
                localStorage.removeItem("access_token");
                router.push("/login");
              }}
              className="rounded p-1 text-gray-400 hover:text-gray-600"
              title="退出"
            >
              <LogOut size={16} />
            </button>
          </div>
          <SessionList
            sessions={sessions}
            activeId={sessionId}
            streamingSessionIds={streamingSessionIds}
            unreadIds={unreadSessions}
            onSelect={loadSession}
            onNew={handleNew}
            onDelete={handleDelete}
          />
        </div>
      </div>

      {/* Center: Chat */}
      <div className="flex flex-1 flex-col min-w-0">
        <div className="flex items-center justify-between border-b px-4 py-2 md:hidden">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-[var(--color-accent)]" />
            <span className="text-sm font-semibold">企业 RAG</span>
          </div>
          <button onClick={() => setShowSources(!showSources)} className="rounded p-1 text-gray-500">
            {showSources ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </button>
        </div>
        <ChatPanel
          messages={messages}
          streaming={streaming}
          streamContent={streamContent}
          statusMsg={statusMsg}
          onSend={handleSend}
          onSourceHover={handleSourceHover}
          onFeedback={handleFeedback}
          kbList={kbList}
          selectedKbIds={selectedKbIds}
          onKbToggle={handleKbToggle}
        />
      </div>

      {/* Right: Source Cards */}
      {showSources && (
        <div className="hidden w-[300px] shrink-0 lg:block">
          <SourceCard sources={sources} activeIndex={activeSource} onHover={handleSourceHover} />
        </div>
      )}
    </div>
  );
}

export default EnterpriseRagInner;
