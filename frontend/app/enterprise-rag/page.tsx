"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { useAuth, AuthProvider } from "@/lib/auth-context";
import { apiGet, apiDelete } from "@/lib/api";
import { streamChat, SSEEvent } from "@/lib/stream";
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
    if (!isAuthenticated()) { router.push("/login"); return; }
    if (!hasPermission("query_knowledge_base")) { router.push("/dashboard"); return; }
    setReady(true);
    loadSessions();
    loadKBs();
  }, [router, authLoading, hasPermission]);

  const loadSessions = async () => {
    try {
      const data = await apiGet<Conversation[]>("/api/sessions?kb_type=enterprise");
      setSessions(data);
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
      // Extract sources from last assistant message
      const last = data.messages?.filter((m: any) => m.role === "assistant").pop();
      setSources(last?.sources || []);
    } catch {}
  }, []);

  const handleNew = () => {
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
    setStreaming(true);
    setStreamContent("");
    setStatusMsg("正在处理...");

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
        top_k: 5,
        session_id: sessionId || undefined,
        knowledge_base_ids: selectedKbIds.length > 0 ? selectedKbIds : undefined,
      })) {
        switch (event.type) {
          case "status":
            setStatusMsg(event.message || "");
            break;
          case "answer":
            fullContent += event.content || "";
            setStreamContent(fullContent);
            setStatusMsg("");
            break;
          case "sources":
            finalSources = (event as any).content || [];
            setSources(finalSources);
            break;
          case "done":
            if (event.session_id) finalSessionId = event.session_id;
            break;
          case "error":
            setStatusMsg("");
            fullContent = `错误: ${event.content || event.error || "未知错误"}`;
            setStreamContent(fullContent);
            break;
        }
      }
    } catch (e: any) {
      fullContent = `请求失败: ${e.message}`;
      setStreamContent(fullContent);
    }

    // Save assistant message
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

    // Update session
    if (finalSessionId && finalSessionId !== sessionId) {
      setSessionId(finalSessionId);
      loadSessions();
    }
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
              <Building2 size={18} className="text-blue-600" />
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
            <Building2 size={18} className="text-blue-600" />
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

export default function EnterpriseRagPage() {
  return (
    <AuthProvider>
      <EnterpriseRagInner />
    </AuthProvider>
  );
}
