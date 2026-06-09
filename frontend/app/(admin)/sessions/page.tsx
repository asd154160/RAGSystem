"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { apiGet } from "@/lib/api";
import { MessageSquare, ThumbsUp, ThumbsDown, ChevronDown, ChevronRight, User, Bot } from "lucide-react";

interface Session {
  id: string;
  title: string;
  kb_type: string;
  user_id: string;
  created_at: string | null;
  updated_at: string | null;
}

interface Message {
  id: string;
  role: string;
  content: string;
  low_confidence: boolean;
  rating: string | null;
  rating_reason: string | null;
  created_at: string | null;
  sources: { document_name: string; chunk_text: string; score: number; section_title: string; page_no: number }[];
}

export default function SessionsPage() {
  const searchParams = useSearchParams();
  const highlightSessionId = searchParams.get("session_id");

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(highlightSessionId);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [loadingMessages, setLoadingMessages] = useState(false);

  const loadSessions = async () => {
    setLoading(true);
    try { setSessions(await apiGet<Session[]>("/api/sessions")); } catch {}
    setLoading(false);
  };

  useEffect(() => { loadSessions(); }, []);

  useEffect(() => {
    if (highlightSessionId) {
      setExpandedId(highlightSessionId);
      loadMessages(highlightSessionId);
    }
  }, [highlightSessionId, sessions]);

  const loadMessages = async (sessionId: string) => {
    if (messages[sessionId]) return;
    setLoadingMessages(true);
    try {
      const sessionData = await apiGet<{ messages: Message[] }>(`/api/sessions/${sessionId}`);
      setMessages(prev => ({ ...prev, [sessionId]: sessionData.messages || [] }));
    } catch {}
    setLoadingMessages(false);
  };

  const toggleExpand = (sessionId: string) => {
    if (expandedId === sessionId) {
      setExpandedId(null);
    } else {
      setExpandedId(sessionId);
      loadMessages(sessionId);
    }
  };

  const formatContent = (content: string) => {
    return content.length > 300 ? content.slice(0, 300) + "..." : content;
  };

  if (loading) return <div className="p-8">加载中...</div>;

  return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h2 className="mb-6 text-xl font-semibold text-gray-800">会话记录</h2>

        <div className="space-y-3">
          {sessions.map(s => (
            <div key={s.id} className="rounded-lg border bg-white">
              <button
                onClick={() => toggleExpand(s.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
              >
                {expandedId === s.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <MessageSquare size={16} className="text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate block">{s.title}</span>
                  <span className="text-xs text-gray-400">
                    {s.kb_type === "enterprise" ? "企业RAG" : "个人RAG"} · {s.updated_at ? new Date(s.updated_at).toLocaleString("zh-CN") : ""}
                  </span>
                </div>
              </button>

              {expandedId === s.id && (
                <div className="border-t px-4 py-3">
                  {loadingMessages && !messages[s.id] ? (
                    <p className="py-4 text-center text-sm text-gray-400">加载消息中...</p>
                  ) : (messages[s.id] || []).length === 0 ? (
                    <p className="py-4 text-center text-sm text-gray-400">暂无消息</p>
                  ) : (
                    <div className="space-y-3">
                      {(messages[s.id] || []).map(m => (
                        <div key={m.id} className={`rounded-lg p-3 ${
                          m.role === "user" ? "bg-blue-50" : "bg-gray-50"
                        }`}>
                          <div className="flex items-center gap-2 mb-2">
                            {m.role === "user" ? (
                              <User size={14} className="text-blue-500" />
                            ) : (
                              <Bot size={14} className="text-green-500" />
                            )}
                            <span className="text-xs font-medium text-gray-500">
                              {m.role === "user" ? "用户" : "AI 助手"}
                            </span>
                            {m.low_confidence && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-600">低置信度</span>
                            )}
                            {m.rating && (
                              <span className={`inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded ${
                                m.rating === "like" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                              }`}>
                                {m.rating === "like" ? <ThumbsUp size={11} /> : <ThumbsDown size={11} />}
                                {m.rating === "like" ? "有用" : `无用${m.rating_reason ? `: ${m.rating_reason}` : ""}`}
                              </span>
                            )}
                            {m.created_at && (
                              <span className="text-xs text-gray-400 ml-auto">
                                {new Date(m.created_at).toLocaleString("zh-CN")}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{formatContent(m.content)}</p>

                          {m.sources && m.sources.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-200">
                              <p className="text-xs text-gray-400 mb-1">引用来源：</p>
                              {m.sources.slice(0, 3).map((src, i) => (
                                <div key={i} className="text-xs text-gray-500 ml-2">
                                  <span className="font-medium">{src.document_name}</span>
                                  {src.section_title && <span> · {src.section_title}</span>}
                                  <span className="text-gray-400"> (score: {src.score?.toFixed(3)})</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {sessions.length === 0 && (
            <p className="py-8 text-center text-gray-400">暂无会话记录</p>
          )}
        </div>
      </div>
  );
}
