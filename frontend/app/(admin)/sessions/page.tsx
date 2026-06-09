"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { apiGet } from "@/lib/api";
import {
  MessageSquare, ThumbsUp, ThumbsDown, ChevronDown, ChevronRight, User, Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

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
  sources: {
    document_name: string;
    chunk_text: string;
    score: number;
    section_title: string;
    page_no: number;
  }[];
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-[var(--color-text-secondary)]">加载中...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h2 className="mb-6 text-xl font-semibold text-[var(--color-text-primary)]">
        会话记录
      </h2>

      <div className="space-y-3">
        {sessions.map(s => (
          <Card key={s.id} className="!p-0">
            {/* Session header */}
            <button
              onClick={() => toggleExpand(s.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--color-background)]"
            >
              {expandedId === s.id ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
              <MessageSquare size={16} className="text-[var(--color-text-secondary)] shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-[var(--color-text-primary)] truncate block">
                  {s.title}
                </span>
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {s.kb_type === "enterprise" ? "企业RAG" : "个人RAG"} ·{" "}
                  {s.updated_at
                    ? new Date(s.updated_at).toLocaleString("zh-CN")
                    : ""}
                </span>
              </div>
            </button>

            {/* Expanded messages */}
            {expandedId === s.id && (
              <div className="border-t border-[var(--color-border)] px-4 py-3">
                {loadingMessages && !messages[s.id] ? (
                  <p className="py-4 text-center text-sm text-[var(--color-text-secondary)]">
                    加载消息中...
                  </p>
                ) : (messages[s.id] || []).length === 0 ? (
                  <p className="py-4 text-center text-sm text-[var(--color-text-secondary)]">
                    暂无消息
                  </p>
                ) : (
                  <div className="space-y-3">
                    {(messages[s.id] || []).map(m => {
                      const isUser = m.role === "user";
                      return (
                        <div
                          key={m.id}
                          className={`max-w-[85%] rounded-lg p-3 ${
                            isUser
                              ? "ml-auto bg-[var(--color-accent-soft)] text-right"
                              : "mr-auto bg-[var(--color-background)] text-left"
                          }`}
                        >
                          {/* Role + meta row */}
                          <div className="flex items-center gap-2 mb-2">
                            {isUser ? (
                              <User size={14} className="text-[var(--color-accent)]" />
                            ) : (
                              <Bot size={14} className="text-emerald-500" />
                            )}
                            <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                              {isUser ? "用户" : "AI 助手"}
                            </span>
                            {m.low_confidence && (
                              <Badge variant="warning">低置信度</Badge>
                            )}
                            {m.rating && (
                              m.rating === "like" ? (
                                <Badge variant="success">
                                  <span className="inline-flex items-center gap-0.5">
                                    <ThumbsUp size={11} /> 有用
                                  </span>
                                </Badge>
                              ) : (
                                <Badge variant="danger">
                                  <span className="inline-flex items-center gap-0.5">
                                    <ThumbsDown size={11} /> 无用{m.rating_reason ? ` — ${m.rating_reason}` : ""}
                                  </span>
                                </Badge>
                              )
                            )}
                            {m.created_at && (
                              <span className="text-xs text-[var(--color-text-secondary)] ml-auto">
                                {new Date(m.created_at).toLocaleString("zh-CN")}
                              </span>
                            )}
                          </div>

                          {/* Content */}
                          <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap text-left">
                            {formatContent(m.content)}
                          </p>

                          {/* Source citations */}
                          {m.sources && m.sources.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-[var(--color-border)]">
                              <p className="text-xs text-[var(--color-text-secondary)] mb-1.5">
                                引用来源：
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {m.sources.slice(0, 5).map((src, i) => (
                                  <span
                                    key={i}
                                    className="inline-block rounded-full bg-white border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-secondary)]"
                                  >
                                    {src.document_name}
                                    {src.section_title && ` · ${src.section_title}`}
                                    <span className="ml-1 opacity-60">
                                      ({src.score?.toFixed(3)})
                                    </span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </Card>
        ))}

        {sessions.length === 0 && (
          <EmptyState icon={MessageSquare} title="暂无会话记录" />
        )}
      </div>
    </div>
  );
}
