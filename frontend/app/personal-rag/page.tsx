"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { useAuth, AuthProvider } from "@/lib/auth-context";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { streamChat } from "@/lib/stream";
import { ChatMessage, Conversation, RagSource } from "@/types";
import SessionList from "@/components/chat/session-list";
import ChatPanel from "@/components/chat/chat-panel";
import SourceCard from "@/components/chat/source-card";
import { LogOut, User, PanelRightOpen, PanelRightClose, ArrowLeft, Upload, Trash2, RefreshCw, FileText, MessageSquare } from "lucide-react";

interface DocInfo {
  id: string;
  title: string;
  file_type: string;
  status: string;
  is_active: boolean;
  latest_version: number;
  file_size: number;
  chunk_count: number;
  created_at: string;
}

interface KBInfo {
  id: string;
  name: string;
  description: string | null;
  document_count: number;
}

function PersonalRagInner() {
  const router = useRouter();
  const { canUsePersonalRag, loading: authLoading } = useAuth();
  const [ready, setReady] = useState(false);

  const [sessions, setSessions] = useState<Conversation[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  const [sources, setSources] = useState<RagSource[]>([]);
  const [activeSource, setActiveSource] = useState<number | null>(null);
  const [showSources, setShowSources] = useState(true);

  const [activeTab, setActiveTab] = useState<"chat" | "docs">("chat");
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [kb, setKb] = useState<KBInfo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");

  const loadKb = async () => {
    try { const data = await apiGet<KBInfo>("/api/personal-rag/kb"); setKb(data); } catch {}
  };
  const loadDocs = async () => {
    try { const data = await apiGet<DocInfo[]>("/api/personal-rag/documents"); setDocs(data); } catch {}
  };

  useEffect(() => { if (ready) { loadKb(); loadDocs(); } }, [ready]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadMsg("");
    try {
      const form = new FormData(); form.append("file", file);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/personal-rag/documents/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
        body: form,
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "上传失败"); }
      setUploadMsg("上传成功，正在解析...");
      loadDocs(); loadKb();
    } catch (e: any) { setUploadMsg(`上传失败: ${e.message}`); }
    finally { setUploading(false); e.target.value = ""; }
  };

  const handleDeleteDoc = async (id: string) => {
    if (!confirm("确定删除此文档？")) return;
    try { await apiDelete(`/api/personal-rag/documents/${id}`); loadDocs(); loadKb(); }
    catch (e: any) { alert(`删除失败: ${e.message}`); }
  };

  const handleRetryDoc = async (id: string) => {
    try { await apiPost(`/api/personal-rag/documents/${id}/retry`); loadDocs(); }
    catch (e: any) { alert(`重试失败: ${e.message}`); }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      uploaded: "待解析", parsing: "解析中", parsed: "已解析",
      published: "已发布", failed: "失败", offline: "已下架",
      pending_review: "待审核", approved: "已审核", rejected: "已驳回",
    };
    return map[s] || s;
  };

  const statusColor = (s: string) => {
    if (s === "published") return "text-green-600";
    if (s === "failed") return "text-red-500";
    if (s === "parsing" || s === "uploaded") return "text-amber-500";
    return "text-gray-500";
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated()) { router.push("/login"); return; }
    if (!canUsePersonalRag) { router.push("/dashboard"); return; }
    setReady(true);
    loadSessions();
  }, [router, authLoading, canUsePersonalRag]);

  const loadSessions = async () => {
    try {
      const data = await apiGet<Conversation[]>("/api/sessions?kb_type=personal");
      setSessions(data);
    } catch {}
  };

  const loadSession = useCallback(async (id: string) => {
    try {
      const data = await apiGet<any>(`/api/sessions/${id}`);
      setSessionId(id);
      setMessages(data.messages || []);
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
      for await (const event of streamChat("/api/personal-rag/chat/stream", {
        question,
        top_k: 5,
        session_id: sessionId || undefined,
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
            fullContent = `错误: ${event.content || "未知错误"}`;
            setStreamContent(fullContent);
            break;
        }
      }
    } catch (e: any) {
      fullContent = `请求失败: ${e.message}`;
      setStreamContent(fullContent);
    }

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

    if (finalSessionId && finalSessionId !== sessionId) {
      setSessionId(finalSessionId);
      loadSessions();
    }
  };

  const handleFeedback = async (messageId: string, rating: string, reason: string) => {
    await apiPost(`/api/sessions/messages/${messageId}/feedback`, { rating, reason });
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, rating, rating_reason: reason } : m
    ));
  };

  const handleSourceHover = (index: number | null) => setActiveSource(index);

  if (!ready) return null;

  return (
    <div className="flex h-screen bg-white">
      <div className="hidden w-[260px] shrink-0 md:block">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b px-3 py-3">
            <div className="flex items-center gap-2">
              <button onClick={() => router.push("/dashboard")} className="rounded p-1 text-gray-400 hover:text-gray-600" title="返回工作台">
                <ArrowLeft size={16} />
              </button>
              <User size={18} className="text-green-600" />
              <span className="text-sm font-semibold text-gray-800">个人 RAG</span>
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
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === "chat" ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            ><MessageSquare size={14} />聊天</button>
            <button
              onClick={() => { setActiveTab("docs"); loadDocs(); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === "docs" ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            ><FileText size={14} />文档</button>
          </div>
          {activeTab === "chat" && (
            <SessionList
              sessions={sessions}
              activeId={sessionId}
              onSelect={loadSession}
              onNew={handleNew}
              onDelete={handleDelete}
            />
          )}
          {activeTab === "docs" && kb && (
            <div className="flex-1 overflow-auto p-3">
              <div className="text-xs text-gray-500 mb-2">{kb.name} · {kb.document_count} 个文档</div>
              <label className={`flex items-center justify-center gap-1.5 w-full py-2 mb-3 rounded border border-dashed text-xs cursor-pointer transition-colors ${
                uploading ? "border-gray-300 text-gray-400 bg-gray-50" : "border-green-400 text-green-600 hover:bg-green-50"
              }`}>
                <Upload size={14} />{uploading ? "上传中..." : "上传文档"}
                <input type="file" accept=".txt,.md,.pdf,.docx,.xlsx,.pptx" onChange={handleUpload} disabled={uploading} className="hidden" />
              </label>
              {uploadMsg && <div className="text-xs text-amber-600 mb-2">{uploadMsg}</div>}
              {docs.length === 0 ? (
                <div className="text-center text-xs text-gray-400 py-8">暂无文档，点击上方上传</div>
              ) : (
                docs.map((d) => (
                  <div key={d.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div className="flex-1 min-w-0 mr-2">
                      <div className="text-xs font-medium text-gray-700 truncate">{d.title}</div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                        <span>{d.file_type}</span>
                        <span className={statusColor(d.status)}>{statusLabel(d.status)}</span>
                        <span>{formatSize(d.file_size)}</span>
                        {d.chunk_count > 0 && <span>{d.chunk_count} chunks</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {d.status === "failed" && (
                        <button onClick={() => handleRetryDoc(d.id)} className="p-1 rounded text-amber-500 hover:text-amber-700" title="重试"><RefreshCw size={13} /></button>
                      )}
                      <button onClick={() => handleDeleteDoc(d.id)} className="p-1 rounded text-gray-400 hover:text-red-500" title="删除"><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        <div className="flex items-center justify-between border-b px-4 py-2 md:hidden">
          <div className="flex items-center gap-2">
            <User size={18} className="text-green-600" />
            <span className="text-sm font-semibold">个人 RAG</span>
          </div>
          <button onClick={() => setShowSources(!showSources)} className="rounded p-1 text-gray-500">
            {showSources ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </button>
        </div>
        {activeTab === "chat" ? (
          <ChatPanel
            messages={messages}
            streaming={streaming}
            streamContent={streamContent}
            statusMsg={statusMsg}
            onSend={handleSend}
            onSourceHover={handleSourceHover}
            onFeedback={handleFeedback}
            selectedKbIds={[]}
          />
        ) : (
          <div className="flex-1 overflow-auto p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">文档管理</h2>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">知识库：{kb?.name || "—"} · {kb?.document_count || 0} 个文档</p>
              <label className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors ${
                uploading ? "bg-gray-300 text-gray-500" : "bg-green-600 text-white hover:bg-green-700"
              }`}>
                <Upload size={16} />{uploading ? "上传中..." : "上传文档"}
                <input type="file" accept=".txt,.md,.pdf,.docx,.xlsx,.pptx" onChange={handleUpload} disabled={uploading} className="hidden" />
              </label>
            </div>
            {uploadMsg && <div className="text-sm text-amber-600 mb-3">{uploadMsg}</div>}
            {docs.length === 0 ? (
              <div className="text-center text-gray-400 py-20">
                <FileText size={48} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">暂无文档</p>
                <p className="text-xs mt-1">上传文档后，系统会自动解析并加入你的个人知识库</p>
              </div>
            ) : (
              <div className="border rounded-lg">
                <div className="grid grid-cols-12 gap-3 px-4 py-2.5 bg-gray-50 border-b text-xs font-medium text-gray-500">
                  <div className="col-span-4">标题</div>
                  <div className="col-span-2">类型</div>
                  <div className="col-span-2">状态</div>
                  <div className="col-span-2">大小</div>
                  <div className="col-span-2">操作</div>
                </div>
                {docs.map((d) => (
                  <div key={d.id} className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-gray-100 last:border-0 items-center text-sm">
                    <div className="col-span-4 font-medium text-gray-800 truncate">{d.title}</div>
                    <div className="col-span-2 text-gray-500">{d.file_type}</div>
                    <div className={`col-span-2 ${statusColor(d.status)}`}>{statusLabel(d.status)}</div>
                    <div className="col-span-2 text-gray-500">{formatSize(d.file_size)}</div>
                    <div className="col-span-2 flex items-center gap-2">
                      {d.status === "failed" && (
                        <button onClick={() => handleRetryDoc(d.id)} className="p-1 rounded text-amber-500 hover:text-amber-700" title="重试"><RefreshCw size={14} /></button>
                      )}
                      <button onClick={() => handleDeleteDoc(d.id)} className="p-1 rounded text-gray-400 hover:text-red-500" title="删除"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {activeTab === "chat" && showSources && (
        <div className="hidden w-[300px] shrink-0 lg:block">
          <SourceCard sources={sources} activeIndex={activeSource} onHover={handleSourceHover} />
        </div>
      )}
    </div>
  );
}

export default function PersonalRagPage() {
  return (
    <AuthProvider>
      <PersonalRagInner />
    </AuthProvider>
  );
}
