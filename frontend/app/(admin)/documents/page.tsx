"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";

import { apiGet, apiPost, apiFetch, apiDelete, apiPatch } from "@/lib/api";
import { Upload, FileText, Eye, Trash2, Pencil, Check, X, Send, RefreshCw, FileUp, CheckCircle, XCircle, Power, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";

interface DocumentItem {
  id: string;
  title: string;
  knowledge_base_id: string;
  file_type: string;
  status: string;
  is_active: boolean;
  latest_version: number;
  created_at: string;
}

interface KnowledgeBase {
  id: string;
  name: string;
}

const TYPE_ICONS: Record<string, string> = {
  pdf: "PDF", docx: "DOC", xlsx: "XLS", pptx: "PPT", txt: "TXT", md: "MD",
};

function statusVariant(s: string) {
  if (s === "published" || s === "approved") return "success" as const;
  if (s === "failed" || s === "rejected") return "danger" as const;
  if (s === "pending_review" || s === "parsing" || s === "parsed" || s === "chunking" || s === "indexing") return "warning" as const;
  if (s === "offline") return "default" as const;
  return "default" as const;
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    draft: "草稿", uploaded: "已上传", parsing: "解析中", parsed: "已解析",
    chunking: "分块中", pending_review: "待审核", approved: "已审核",
    indexing: "索引中", published: "已发布", rejected: "已驳回",
    offline: "已下线", failed: "失败", embedding_failed: "嵌入失败",
  };
  return map[s] || s;
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKb, setSelectedKb] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = useCallback(async () => {
    try {
      const query = selectedKb ? `?knowledge_base_id=${selectedKb}` : "";
      const data = await apiGet<DocumentItem[]>(`/api/documents${query}`);
      setDocs(data);
    } catch (err) { console.error(err); }
  }, [selectedKb]);

  useEffect(() => {
    apiGet<KnowledgeBase[]>("/api/knowledge-bases").then(data => {
      setKbs(data);
      if (data.length > 0) setSelectedKb(data[0].id);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (selectedKb) { fetchDocs(); setSelectedIds(new Set()); } }, [selectedKb, fetchDocs]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedKb) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("knowledge_base_id", selectedKb);

      const res = await apiFetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      } as RequestInit);
      if (res.ok) fetchDocs();
    } catch (err) { console.error(err); }
    finally { setUploading(false); e.target.value = ""; }
  }

  function triggerReplace(docId: string) {
    setReplacingId(docId);
    replaceInputRef.current?.click();
  }

  async function handleReplace(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !replacingId) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiFetch(`/api/documents/${replacingId}/replace`, {
        method: "POST",
        body: formData,
      } as RequestInit);
      const data = await res.json();
      if (res.ok) {
        if (!data.skipped) alert(`已更新为 v${data.version_number}`);
        fetchDocs();
      } else {
        alert(data.detail || "更新失败");
      }
    } catch (err) { console.error(err); }
    finally { setUploading(false); setReplacingId(null); }
    e.target.value = "";
  }

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function handlePreview(docId: string) {
    try {
      const res = await apiFetch(`/api/documents/${docId}/preview/file`);
      if (!res.ok) throw new Error(`Preview failed: ${res.status}`);
      const contentType = res.headers.get("Content-Type") || "application/octet-stream";

      let blob: Blob;
      if (contentType.includes("text/plain")) {
        const text = await res.text();
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:960px;margin:2rem auto;padding:0 1.5rem;line-height:1.7;white-space:pre-wrap;word-break:break-all;color:#1a1a1a;}</style></head><body>${escapeHtml(text)}</body></html>`;
        blob = new Blob([html], { type: "text/html;charset=utf-8" });
      } else {
        const buffer = await res.arrayBuffer();
        blob = new Blob([buffer], { type: contentType });
      }

      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (err) { console.error(err); }
  }

  async function handlePublish(docId: string) {
    if (!confirm("确认发布该文档？发布后文档将可被检索。")) return;
    try {
      await apiPost(`/api/documents/${docId}/publish`);
      fetchDocs();
    } catch (err) { console.error(err); }
  }

  async function handleIndex(docId: string) {
    if (!confirm("确认重建索引？将重新生成向量并写入Milvus。")) return;
    try {
      await apiPost(`/api/documents/${docId}/index`);
      alert("索引任务已创建，worker 将自动处理。");
    } catch (err) { console.error(err); }
  }

  async function handleReview(docId: string, action: "approve" | "reject") {
    const label = action === "approve" ? "批准" : "驳回";
    if (!confirm(`确认${label}该文档？`)) return;
    try {
      await apiPost(`/api/documents/${docId}/review`, { action });
      fetchDocs();
    } catch (err) { console.error(err); }
  }

  async function handleOffline(docId: string) {
    if (!confirm("确认下线该文档？下线后将无法检索。")) return;
    try {
      await apiPost(`/api/documents/${docId}/offline`);
      fetchDocs();
    } catch (err) { console.error(err); }
  }

  async function handleOnline(docId: string) {
    if (!confirm("确认重新上线该文档？将重建索引。")) return;
    try {
      await apiPost(`/api/documents/${docId}/online`);
      fetchDocs();
    } catch (err) { console.error(err); }
  }

  async function handleDelete(docId: string) {
    if (!confirm("确认删除该文档？此操作不可撤销。")) return;
    try {
      await apiDelete(`/api/documents/${docId}`);
      fetchDocs();
    } catch (err) { console.error(err); }
  }

  // ── Batch operations ──

  function toggleSelectAll() {
    if (selectedIds.size === docs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(docs.map(d => d.id)));
    }
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  }

  async function handleBatchPublish() {
    if (!confirm(`确认批量发布 ${selectedIds.size} 个文档？`)) return;
    try {
      const res = await apiPost(`/api/documents/batch/publish`, { document_ids: Array.from(selectedIds) });
      setSelectedIds(new Set());
      alert(`${(res as { message: string }).message || "完成"}`);
      fetchDocs();
    } catch (err) { alert(err instanceof Error ? err.message : "操作失败"); }
  }

  async function handleBatchOffline() {
    if (!confirm(`确认批量下线 ${selectedIds.size} 个文档？`)) return;
    try {
      const res = await apiPost(`/api/documents/batch/offline`, { document_ids: Array.from(selectedIds) });
      setSelectedIds(new Set());
      alert(`${(res as { message: string }).message || "完成"}`);
      fetchDocs();
    } catch (err) { alert(err instanceof Error ? err.message : "操作失败"); }
  }

  async function handleBatchDelete() {
    if (!confirm(`确认批量删除 ${selectedIds.size} 个文档？此操作不可撤销。`)) return;
    try {
      await apiFetch(`/api/documents/batch`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_ids: Array.from(selectedIds) }),
      });
      setSelectedIds(new Set());
      fetchDocs();
    } catch (err) { alert(err instanceof Error ? err.message : "操作失败"); }
  }

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  function startEdit(doc: DocumentItem) {
    setEditingId(doc.id);
    setEditTitle(doc.title);
  }

  async function saveEdit(docId: string) {
    if (!editTitle.trim()) return;
    try {
      await apiPatch(`/api/documents/${docId}`, { title: editTitle.trim() });
      setEditingId(null);
      fetchDocs();
    } catch (err) { console.error(err); }
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle("");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-[var(--color-text-secondary)]">加载中...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">文档管理</h2>
        <div className="flex items-center gap-3">
          <select
            className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text-primary)]"
            value={selectedKb}
            onChange={(e) => setSelectedKb(e.target.value)}
          >
            {kbs.map((kb) => (
              <option key={kb.id} value={kb.id}>{kb.name}</option>
            ))}
          </select>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
          <Button
            variant="primary"
            loading={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={16} />
            上传文档
          </Button>
          <input
            ref={replaceInputRef}
            type="file"
            className="hidden"
            onChange={handleReplace}
            disabled={uploading}
          />
        </div>
      </div>

      {/* Batch toolbar */}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-[var(--color-accent)]/20 bg-[var(--color-accent-soft)] px-4 py-2.5">
          <span className="text-sm font-medium text-[var(--color-accent)]">已选择 {selectedIds.size} 项</span>
          <div className="flex gap-2 ml-auto">
            <Button variant="primary" size="sm" onClick={handleBatchPublish}>批量发布</Button>
            <Button variant="secondary" size="sm" onClick={handleBatchOffline}>批量下线</Button>
            <Button variant="danger" size="sm" onClick={handleBatchDelete}>批量删除</Button>
          </div>
        </div>
      )}

      {/* Table or Empty State */}
      {docs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="暂无文档"
          description="请选择知识库并上传文档"
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-background)] text-left text-[var(--color-text-secondary)]">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={docs.length > 0 && selectedIds.size === docs.length}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                  />
                </th>
                <th className="px-4 py-3 font-medium">文件名</th>
                <th className="px-4 py-3 font-medium">类型</th>
                <th className="px-4 py-3 font-medium">版本</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">上传时间</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)] text-[var(--color-text-primary)]">
              {docs.map((doc) => (
                <tr key={doc.id} className="hover:bg-[var(--color-background)]">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(doc.id)}
                      onChange={() => toggleSelect(doc.id)}
                      className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {editingId === doc.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(doc.id);
                            if (e.key === "Escape") cancelEdit();
                          }}
                          autoFocus
                        />
                        <Button variant="ghost" size="sm" onClick={() => saveEdit(doc.id)} className="!text-emerald-600">
                          <Check size={16} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={cancelEdit}>
                          <X size={16} />
                        </Button>
                      </div>
                    ) : (
                      <span className="flex items-center gap-2">
                        <FileText size={16} className="text-[var(--color-text-secondary)]" />
                        {doc.title}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="default">
                      {TYPE_ICONS[doc.file_type] || doc.file_type.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">v{doc.latest_version}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(doc.status)}>
                      {statusLabel(doc.status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {new Date(doc.created_at).toLocaleDateString("zh-CN")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editingId !== doc.id && (
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handlePreview(doc.id)} title="预览">
                          <Eye size={16} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => triggerReplace(doc.id)} title="更新版本">
                          <FileUp size={16} />
                        </Button>
                        {doc.status === "pending_review" && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => handleReview(doc.id, "approve")} className="!text-emerald-600" title="批准">
                              <CheckCircle size={16} />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleReview(doc.id, "reject")} className="!text-red-500" title="驳回">
                              <XCircle size={16} />
                            </Button>
                          </>
                        )}
                        {doc.status === "approved" && (
                          <Button variant="ghost" size="sm" onClick={() => handlePublish(doc.id)} className="!text-emerald-600" title="发布">
                            <Send size={16} />
                          </Button>
                        )}
                        {doc.status === "published" && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => handleIndex(doc.id)} title="重建索引">
                              <RefreshCw size={16} />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleOffline(doc.id)} className="!text-amber-500" title="下线">
                              <Power size={16} />
                            </Button>
                          </>
                        )}
                        {doc.status === "offline" && (
                          <Button variant="ghost" size="sm" onClick={() => handleOnline(doc.id)} className="!text-emerald-600" title="重新上线">
                            <RotateCcw size={16} />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => startEdit(doc)} title="重命名">
                          <Pencil size={16} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(doc.id)} className="!text-red-500" title="删除">
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
