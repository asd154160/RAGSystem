"use client";

import { useEffect, useState, useCallback } from "react";
import AdminLayout from "@/components/layout/admin-layout";
import { apiGet, apiPost, apiFetch } from "@/lib/api";
import { Check, X, FileText, ChevronDown, ChevronRight, Send } from "lucide-react";

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

export default function ReviewPage() {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [chunks, setChunks] = useState<ChunkItem[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");

  const fetchDocs = useCallback(async () => {
    try {
      const data = await apiGet<DocumentItem[]>("/api/documents");
      setDocs(data.filter(d => d.status === "pending_review" || d.status === "approved"));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  async function loadChunks(docId: string) {
    setChunksLoading(true);
    setSelectedDoc(docId === selectedDoc ? null : docId);
    try {
      const data = await apiGet<ChunkItem[]>(`/api/documents/${docId}/chunks`);
      setChunks(data);
    } catch (err) { console.error(err); }
    finally { setChunksLoading(false); }
  }

  async function handleReview(docId: string, action: "approve" | "reject") {
    if (action === "reject" && !reason.trim()) { setMessage("请填写驳回原因"); return; }
    setProcessing(true);
    setMessage("");
    try {
      const token = localStorage.getItem("access_token");
      const res = await apiFetch(`/api/documents/${docId}/review`, {
        method: "POST",
        body: JSON.stringify({ action, reason: action === "reject" ? reason : "" }),
      });
      const data = await res.json();
      setMessage(data.message || data.detail || "操作完成");
      if (res.ok) {
        setSelectedDoc(null);
        setChunks([]);
        setReason("");
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

  const statusLabel = (s: string) => {
    const m: Record<string, string> = { pending_review: "待审核", approved: "已审核", published: "已发布", rejected: "已驳回" };
    return m[s] || s;
  };

  if (loading) {
    return <AdminLayout><div className="flex items-center justify-center py-20"><p className="text-gray-500">加载中...</p></div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-6 text-lg font-semibold text-gray-800">文档审核</h2>

        {message && (
          <div className={`mb-4 rounded-md p-3 text-sm ${message.includes("失败") || message.includes("错误") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
            {message}
          </div>
        )}

        {docs.length === 0 ? (
          <div className="rounded-lg border bg-white py-16 text-center text-gray-400">暂无待审核文档</div>
        ) : (
          <div className="space-y-3">
            {docs.map((doc) => (
              <div key={doc.id} className="rounded-lg border bg-white shadow-sm">
                <div className="flex items-center justify-between p-4">
                  <button
                    className="flex items-center gap-2 text-left hover:text-blue-600"
                    onClick={() => loadChunks(doc.id)}
                  >
                    {selectedDoc === doc.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <FileText size={16} className="text-gray-400" />
                    <div>
                      <p className="text-sm font-medium">{doc.title}</p>
                      <p className="text-xs text-gray-400">
                        {doc.file_type.toUpperCase()} · {new Date(doc.created_at).toLocaleDateString("zh-CN")} · <span className="text-yellow-600">{statusLabel(doc.status)}</span>
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2">
                    {doc.status === "pending_review" ? (
                      <>
                        <input
                          className="rounded-md border px-2 py-1 text-xs w-40"
                          placeholder="驳回原因（必填）"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                        />
                        <button
                          onClick={() => handleReview(doc.id, "approve")}
                          disabled={processing}
                          className="flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          <Check size={14} />通过
                        </button>
                        <button
                          onClick={() => handleReview(doc.id, "reject")}
                          disabled={processing}
                          className="flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          <X size={14} />驳回
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handlePublish(doc.id)}
                        disabled={processing}
                        className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        <Send size={14} />发布
                      </button>
                    )}
                  </div>
                </div>

                {selectedDoc === doc.id && (
                  <div className="border-t bg-gray-50 p-4">
                    {chunksLoading ? (
                      <p className="text-sm text-gray-400">加载中...</p>
                    ) : (
                      <div className="space-y-2 max-h-80 overflow-auto">
                        <p className="mb-2 text-xs font-medium text-gray-500">Chunk 预览 ({chunks.length} 个)</p>
                        {chunks.map((c) => (
                          <div key={c.id} className="rounded border bg-white p-2 text-xs">
                            <div className="mb-1 flex items-center gap-2 text-gray-400">
                              <span className="font-mono">#{c.chunk_index}</span>
                              {c.section_title && <span className="text-blue-500">[{c.section_title}]</span>}
                              {c.parent_chunk_id && <span className="text-green-500">parent chunk</span>}
                              <span className="ml-auto">{c.token_count} tokens</span>
                            </div>
                            <p className="text-gray-700 leading-relaxed">{c.chunk_text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
