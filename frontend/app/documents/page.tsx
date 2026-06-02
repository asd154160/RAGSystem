"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import AdminLayout from "@/components/layout/admin-layout";
import { apiGet, apiPost, apiFetch, apiDelete, apiPatch } from "@/lib/api";
import { Upload, FileText, Eye, Trash2, Pencil, Check, X, Send, RefreshCw, FileUp } from "lucide-react";

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

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKb, setSelectedKb] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [replacingId, setReplacingId] = useState<string | null>(null);
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

  useEffect(() => { if (selectedKb) fetchDocs(); }, [selectedKb, fetchDocs]);

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
    finally { setUploading(false); }
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

  async function handlePreview(docId: string) {
    try {
      const data = await apiGet<{url: string}>(`/api/documents/${docId}/preview`);
      window.open(data.url, "_blank");
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

  async function handleDelete(docId: string) {
    if (!confirm("确认删除该文档？此操作不可撤销。")) return;
    try {
      await apiDelete(`/api/documents/${docId}`);
      fetchDocs();
    } catch (err) { console.error(err); }
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

  const statusLabel = (s: string) => {
    const map: Record<string, string> = { uploaded: "已上传", parsing: "解析中", parsed: "已解析", pending_review: "待审核", approved: "已审核", published: "已发布", failed: "失败" };
    return map[s] || s;
  };

  if (loading) {
    return <AdminLayout><div className="flex items-center justify-center py-20"><p className="text-gray-500">加载中...</p></div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">文档管理</h2>
          <div className="flex items-center gap-3">
            <select className="rounded-md border px-3 py-2 text-sm" value={selectedKb} onChange={(e) => setSelectedKb(e.target.value)}>
              {kbs.map((kb) => <option key={kb.id} value={kb.id}>{kb.name}</option>)}
            </select>
            <label className="flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              <Upload size={16} />
              {uploading ? "上传中..." : "上传文档"}
              <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
            <input ref={replaceInputRef} type="file" className="hidden" onChange={handleReplace} disabled={uploading} />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">文件名</th>
                <th className="px-4 py-3 font-medium">类型</th>
                <th className="px-4 py-3 font-medium">版本</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">上传时间</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y text-gray-700">
              {docs.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    {editingId === doc.id ? (
                      <input
                        className="w-full rounded border px-2 py-1 text-sm"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(doc.id); if (e.key === "Escape") cancelEdit(); }}
                        autoFocus
                      />
                    ) : (
                      <span className="flex items-center gap-2"><FileText size={16} className="text-gray-400" />{doc.title}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">{TYPE_ICONS[doc.file_type] || doc.file_type.toUpperCase()}</span>
                  </td>
                  <td className="px-4 py-3">v{doc.latest_version}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${doc.status === "published" ? "bg-green-50 text-green-700" : doc.status === "failed" ? "bg-red-50 text-red-700" : "bg-yellow-50 text-yellow-700"}`}>{statusLabel(doc.status)}</span>
                  </td>
                  <td className="px-4 py-3">{new Date(doc.created_at).toLocaleDateString("zh-CN")}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {editingId === doc.id ? (
                        <>
                          <button onClick={() => saveEdit(doc.id)} className="text-green-500 hover:text-green-700" title="保存"><Check size={16} /></button>
                          <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600" title="取消"><X size={16} /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => handlePreview(doc.id)} className="text-blue-500 hover:text-blue-700" title="预览"><Eye size={16} /></button>
                          <button onClick={() => triggerReplace(doc.id)} className="text-orange-500 hover:text-orange-700" title="更新版本"><FileUp size={16} /></button>
                          {doc.status === "approved" && (
                            <button onClick={() => handlePublish(doc.id)} className="text-green-500 hover:text-green-700" title="发布"><Send size={16} /></button>
                          )}
                          {doc.status === "published" && (
                            <button onClick={() => handleIndex(doc.id)} className="text-purple-500 hover:text-purple-700" title="重建索引"><RefreshCw size={16} /></button>
                          )}
                          <button onClick={() => startEdit(doc)} className="text-gray-400 hover:text-gray-600" title="重命名"><Pencil size={16} /></button>
                          <button onClick={() => handleDelete(doc.id)} className="text-red-400 hover:text-red-600" title="删除"><Trash2 size={16} /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {docs.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">暂无文档，请上传</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
