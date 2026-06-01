"use client";

import { useEffect, useState, useCallback } from "react";
import AdminLayout from "@/components/layout/admin-layout";
import { apiGet, apiPost, apiDelete, apiPatch } from "@/lib/api";
import { Plus, Trash2, X, Pencil, Check } from "lucide-react";

interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  type: string;
  is_active: boolean;
  created_at: string;
}

export default function KnowledgeBasesPage() {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", type: "enterprise" });
  const [error, setError] = useState("");

  const fetchKbs = useCallback(async () => {
    try {
      const data = await apiGet<KnowledgeBase[]>("/api/knowledge-bases");
      setKbs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchKbs(); }, [fetchKbs]);

  async function handleCreate() {
    if (!form.name.trim()) { setError("请输入知识库名称"); return; }
    try {
      await apiPost("/api/knowledge-bases", form);
      setShowForm(false);
      setForm({ name: "", description: "", type: "enterprise" });
      setError("");
      fetchKbs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("确定删除该知识库？所有文档将同时删除。")) return;
    try {
      await apiDelete(`/api/knowledge-bases/${id}`);
      fetchKbs();
    } catch (err) { console.error(err); }
  }

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "" });

  function startEdit(kb: KnowledgeBase) {
    setEditingId(kb.id);
    setEditForm({ name: kb.name, description: kb.description || "" });
  }

  async function saveEdit(kbId: string) {
    if (!editForm.name.trim()) return;
    try {
      await apiPatch(`/api/knowledge-bases/${kbId}`, { name: editForm.name.trim(), description: editForm.description.trim() || null });
      setEditingId(null);
      fetchKbs();
    } catch (err) { console.error(err); }
  }

  function cancelEdit() {
    setEditingId(null);
  }

  if (loading) {
    return <AdminLayout><div className="flex items-center justify-center py-20"><p className="text-gray-500">加载中...</p></div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">知识库管理</h2>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus size={16} />新建知识库
          </button>
        </div>

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">新建知识库</h3>
                <button onClick={() => setShowForm(false)}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
              </div>
              <div className="space-y-3">
                <input className="w-full rounded-md border px-3 py-2 text-sm" placeholder="知识库名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <input className="w-full rounded-md border px-3 py-2 text-sm" placeholder="描述（可选）" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                <select className="w-full rounded-md border px-3 py-2 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="enterprise">企业知识库</option>
                  <option value="personal">个人知识库</option>
                </select>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button onClick={handleCreate} className="w-full rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700">创建</button>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">名称</th>
                <th className="px-4 py-3 font-medium">类型</th>
                <th className="px-4 py-3 font-medium">描述</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y text-gray-700">
              {kbs.map((kb) => (
                <tr key={kb.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    {editingId === kb.id ? (
                      <input
                        className="w-full rounded border px-2 py-1 text-sm"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(kb.id); if (e.key === "Escape") cancelEdit(); }}
                        autoFocus
                      />
                    ) : kb.name}
                  </td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${kb.type === "enterprise" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}`}>{kb.type === "enterprise" ? "企业" : "个人"}</span></td>
                  <td className="px-4 py-3">
                    {editingId === kb.id ? (
                      <input
                        className="w-full rounded border px-2 py-1 text-sm"
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(kb.id); if (e.key === "Escape") cancelEdit(); }}
                        placeholder="描述（可选）"
                      />
                    ) : (kb.description || "-")}
                  </td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${kb.is_active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{kb.is_active ? "正常" : "已禁用"}</span></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {editingId === kb.id ? (
                        <button onClick={() => saveEdit(kb.id)} className="text-green-500 hover:text-green-700" title="保存"><Check size={16} /></button>
                      ) : (
                        <button onClick={() => startEdit(kb)} className="text-gray-400 hover:text-gray-600" title="编辑"><Pencil size={16} /></button>
                      )}
                      {editingId === kb.id ? (
                        <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600" title="取消"><X size={16} /></button>
                      ) : (
                        <button onClick={() => handleDelete(kb.id)} className="text-red-500 hover:text-red-700" title="删除"><Trash2 size={16} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {kbs.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">暂无知识库</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
