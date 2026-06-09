"use client";

import { useEffect, useState, useCallback } from "react";

import { apiGet, apiPost, apiFetch } from "@/lib/api";
import { Check, X, FileText, ChevronDown, ChevronRight, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

interface DocumentItem {
  id: string;
  title: string;
  knowledge_base_id: string;
  file_type: string;
  status: string;
  created_at: string;
}

interface ChunkItem {
  id: string;
  chunk_index: number;
  chunk_text: string;
  token_count: number;
  section_title: string | null;
  page_no: number | null;
  parent_chunk_id: string | null;
}

function statusVariant(s: string) {
  if (s === "approved") return "success" as const;
  if (s === "pending_review") return "warning" as const;
  if (s === "rejected") return "danger" as const;
  return "default" as const;
}

function statusLabel(s: string) {
  const m: Record<string, string> = {
    pending_review: "待审核", approved: "已审核", published: "已发布", rejected: "已驳回",
  };
  return m[s] || s;
}

export default function ReviewPage() {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [chunks, setChunks] = useState<ChunkItem[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");

  // Per-document reject flow
  const [rejectingDocId, setRejectingDocId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const fetchDocs = useCallback(async () => {
    try {
      const data = await apiGet<DocumentItem[]>("/api/documents");
      setDocs(data.filter(d => d.status === "pending_review" || d.status === "approved"));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  async function loadChunks(docId: string) {
    if (selectedDoc === docId) {
      setSelectedDoc(null);
      setChunks([]);
      return;
    }
    setChunksLoading(true);
    setSelectedDoc(docId);
    try {
      const data = await apiGet<ChunkItem[]>(`/api/documents/${docId}/chunks`);
      setChunks(data);
    } catch (err) { console.error(err); }
    finally { setChunksLoading(false); }
  }

  function startReject(docId: string) {
    setRejectingDocId(docId);
    setRejectReason("");
  }

  function cancelReject() {
    setRejectingDocId(null);
    setRejectReason("");
  }

  async function handleReview(docId: string, action: "approve" | "reject") {
    if (action === "reject" && !rejectReason.trim()) {
      setMessage("请填写驳回原因");
      return;
    }
    setProcessing(true);
    setMessage("");
    try {
      const res = await apiFetch(`/api/documents/${docId}/review`, {
        method: "POST",
        body: JSON.stringify({ action, reason: action === "reject" ? rejectReason : "" }),
      });
      const data = await res.json();
      setMessage(data.message || data.detail || "操作完成");
      if (res.ok) {
        setSelectedDoc(null);
        setChunks([]);
        setRejectingDocId(null);
        setRejectReason("");
        fetchDocs();
      }
    } catch (err) { setMessage("操作失败"); }
    finally { setProcessing(false); }
  }

  async function handlePublish(docId: string) {
    setProcessing(true);
    setMessage("");
    try {
      const res = await apiFetch(`/api/documents/${docId}/publish`, { method: "POST" });
      const data = await res.json();
      setMessage(data.message || data.detail || "操作完成");
      if (res.ok) fetchDocs();
    } catch (err) { setMessage("发布失败"); }
    finally { setProcessing(false); }
  }

  const isErrorMsg = message.includes("失败") || message.includes("错误");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-[var(--color-text-secondary)]">加载中...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h2 className="mb-6 text-lg font-semibold text-[var(--color-text-primary)]">文档审核</h2>

      {/* Message banner */}
      {message && (
        <div
          className={`mb-4 rounded-md border p-3 text-sm ${
            isErrorMsg
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-emerald-50 border-emerald-200 text-emerald-700"
          }`}
        >
          {message}
        </div>
      )}

      {docs.length === 0 ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-white py-16 text-center text-[var(--color-text-secondary)]">
          暂无待审核文档
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map((doc) => (
            <Card key={doc.id} className="!p-0">
              {/* Card header: title + actions */}
              <div className="flex items-center justify-between p-4">
                <button
                  className="flex items-center gap-2 text-left hover:text-[var(--color-accent)]"
                  onClick={() => loadChunks(doc.id)}
                >
                  {selectedDoc === doc.id ? (
                    <ChevronDown size={16} />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                  <FileText size={16} className="text-[var(--color-text-secondary)]" />
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      {doc.title}
                    </p>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {doc.file_type.toUpperCase()} ·{" "}
                      {new Date(doc.created_at).toLocaleDateString("zh-CN")} ·{" "}
                      <Badge variant={statusVariant(doc.status)}>
                        {statusLabel(doc.status)}
                      </Badge>
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-2">
                  {doc.status === "pending_review" ? (
                    <>
                      <Button
                        variant="primary"
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => handleReview(doc.id, "approve")}
                        disabled={processing}
                      >
                        <Check size={14} />
                        通过
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => startReject(doc.id)}
                        disabled={processing}
                      >
                        <X size={14} />
                        驳回
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handlePublish(doc.id)}
                      disabled={processing}
                    >
                      <Send size={14} />
                      发布
                    </Button>
                  )}
                </div>
              </div>

              {/* Inline reject reason */}
              {rejectingDocId === doc.id && (
                <div className="border-t border-[var(--color-border)] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Input
                      className="flex-1"
                      placeholder="驳回原因（必填）"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleReview(doc.id, "reject");
                        if (e.key === "Escape") cancelReject();
                      }}
                      autoFocus
                    />
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleReview(doc.id, "reject")}
                      disabled={processing}
                    >
                      确认驳回
                    </Button>
                    <Button variant="ghost" size="sm" onClick={cancelReject}>
                      取消
                    </Button>
                  </div>
                </div>
              )}

              {/* Expandable chunks */}
              {selectedDoc === doc.id && (
                <div className="border-t border-[var(--color-border)] bg-[var(--color-background)] p-4">
                  {chunksLoading ? (
                    <p className="text-sm text-[var(--color-text-secondary)]">加载中...</p>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-auto">
                      <p className="mb-2 text-xs font-medium text-[var(--color-text-secondary)]">
                        Chunk 预览 ({chunks.length} 个)
                      </p>
                      {chunks.map((c) => (
                        <Card key={c.id} className="!p-2 bg-[var(--color-background)]">
                          <div className="mb-1 flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                            <span className="font-mono">#{c.chunk_index}</span>
                            {c.section_title && (
                              <span className="text-[var(--color-accent)]">
                                [{c.section_title}]
                              </span>
                            )}
                            {c.parent_chunk_id && (
                              <span className="text-[var(--color-accent)]">parent chunk</span>
                            )}
                            <span className="ml-auto">{c.token_count} tokens</span>
                          </div>
                          <p className="text-xs text-[var(--color-text-primary)] leading-relaxed">
                            {c.chunk_text}
                          </p>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
