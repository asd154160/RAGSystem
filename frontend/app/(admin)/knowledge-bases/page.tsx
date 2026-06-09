"use client";

import { useEffect, useState, useCallback } from "react";

import { apiGet, apiPost, apiDelete, apiPatch } from "@/lib/api";
import { Plus, Trash2, X, Pencil, Check, Shield, ShieldOff } from "lucide-react";

interface KnowledgeBase {
  id: string; name: string; description: string | null;
  type: string; is_active: boolean; created_at: string;
}

interface UserOverride {
  id: string; user_id: string; knowledge_base_id: string; override_type: string;
}

interface DepartmentOverride {
  id: string; department_id: string; knowledge_base_id: string; override_type: string;
}

interface UserBrief { id: string; username: string; email: string; }
interface DepartmentBrief { id: string; name: string; }

export default function KnowledgeBasesPage() {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [users, setUsers] = useState<UserBrief[]>([]);
  const [departments, setDepartments] = useState<DepartmentBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", type: "enterprise" });
  const [error, setError] = useState("");

  // Override management state
  const [overrideKbId, setOverrideKbId] = useState<string | null>(null);
  const [overrideKbName, setOverrideKbName] = useState("");
  const [overrideTab, setOverrideTab] = useState<"user" | "department">("user");
  const [userOverrides, setUserOverrides] = useState<UserOverride[]>([]);
  const [deptOverrides, setDeptOverrides] = useState<DepartmentOverride[]>([]);

  // "Add override" form state
  const [newOverrideUserId, setNewOverrideUserId] = useState("");
  const [newOverrideType, setNewOverrideType] = useState("allow");
  const [newOverrideDeptId, setNewOverrideDeptId] = useState("");
  const [newOverrideDeptType, setNewOverrideDeptType] = useState("allow");

  const fetchKbs = useCallback(async () => {
    try {
      const data = await apiGet<KnowledgeBase[]>("/api/knowledge-bases");
      setKbs(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const u = await apiGet<UserBrief[]>("/api/users");
      setUsers(u);
    } catch (err) { console.error(err); }
  }, []);

  const fetchDepartments = useCallback(async () => {
    try {
      const d = await apiGet<DepartmentBrief[]>("/api/departments");
      setDepartments(d);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { fetchKbs(); fetchUsers(); fetchDepartments(); }, [fetchKbs, fetchUsers, fetchDepartments]);

  async function handleCreate() {
    if (!form.name.trim()) { setError("请输入知识库名称"); return; }
    try {
      await apiPost("/api/knowledge-bases", form);
      setShowForm(false);
      setForm({ name: "", description: "", type: "enterprise" });
      setError("");
      fetchKbs();
    } catch (err) { setError(err instanceof Error ? err.message : "创建失败"); }
  }

  async function handleDelete(id: string) {
    if (!confirm("确定删除该知识库？所有文档将同时删除。")) return;
    try { await apiDelete(`/api/knowledge-bases/${id}`); fetchKbs(); }
    catch (err) { console.error(err); }
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
      setEditingId(null); fetchKbs();
    } catch (err) { console.error(err); }
  }

  function cancelEdit() { setEditingId(null); }

  // ── Override management ──

  async function openOverrides(kb: KnowledgeBase) {
    setOverrideKbId(kb.id);
    setOverrideKbName(kb.name);
    setOverrideTab("user");
    setNewOverrideUserId(""); setNewOverrideType("allow");
    setNewOverrideDeptId(""); setNewOverrideDeptType("allow");
    try {
      const [uo, dos] = await Promise.all([
        apiGet<UserOverride[]>(`/api/knowledge-bases/${kb.id}/user-overrides`),
        apiGet<DepartmentOverride[]>(`/api/knowledge-bases/${kb.id}/department-overrides`),
      ]);
      setUserOverrides(uo);
      setDeptOverrides(dos);
    } catch (err) { console.error(err); }
  }

  async function handleAddUserOverride() {
    if (!overrideKbId || !newOverrideUserId) return;
    try {
      await apiPost(`/api/knowledge-bases/${overrideKbId}/user-overrides`, {
        user_id: newOverrideUserId, override_type: newOverrideType,
      });
      const o = await apiGet<UserOverride[]>(`/api/knowledge-bases/${overrideKbId}/user-overrides`);
      setUserOverrides(o);
      setNewOverrideUserId("");
    } catch (err) { console.error(err); }
  }

  async function handleDeleteUserOverride(overrideId: string) {
    if (!overrideKbId) return;
    try {
      await apiDelete(`/api/knowledge-bases/${overrideKbId}/user-overrides/${overrideId}`);
      setUserOverrides(prev => prev.filter(o => o.id !== overrideId));
    } catch (err) { console.error(err); }
  }

  async function handleAddDeptOverride() {
    if (!overrideKbId || !newOverrideDeptId) return;
    try {
      await apiPost(`/api/knowledge-bases/${overrideKbId}/department-overrides`, {
        department_id: newOverrideDeptId, override_type: newOverrideDeptType,
      });
      const o = await apiGet<DepartmentOverride[]>(`/api/knowledge-bases/${overrideKbId}/department-overrides`);
      setDeptOverrides(o);
      setNewOverrideDeptId("");
    } catch (err) { console.error(err); }
  }

  async function handleDeleteDeptOverride(overrideId: string) {
    if (!overrideKbId) return;
    try {
      await apiDelete(`/api/knowledge-bases/${overrideKbId}/department-overrides/${overrideId}`);
      setDeptOverrides(prev => prev.filter(o => o.id !== overrideId));
    } catch (err) { console.error(err); }
  }

  function getUserName(uid: string) {
    return users.find(u => u.id === uid)?.username || uid.slice(0, 8);
  }

  function getDeptName(did: string) {
    return departments.find(d => d.id === did)?.name || did.slice(0, 8);
  }

  // ── Render ──

  if (loading) {
    return <div className="flex items-center justify-center py-20"><p className="text-gray-500">加载中...</p></div>;
  }

  return (
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">知识库管理</h2>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus size={16} />新建知识库
          </button>
        </div>

        {/* Create form modal */}
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

        {/* Override management modal */}
        {overrideKbId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">
                  <Shield size={16} className="inline mr-1.5" />
                  {overrideKbName} — 查询权限
                </h3>
                <button onClick={() => setOverrideKbId(null)}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
              </div>

              <p className="text-xs text-gray-500 mb-3">
                默认所有用户可查询。用户级覆盖优先级高于部门级。
              </p>

              {/* Tab bar */}
              <div className="flex border-b mb-3">
                <button
                  onClick={() => setOverrideTab("user")}
                  className={`px-4 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                    overrideTab === "user"
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  用户覆盖 ({userOverrides.length})
                </button>
                <button
                  onClick={() => setOverrideTab("department")}
                  className={`px-4 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                    overrideTab === "department"
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  部门覆盖 ({deptOverrides.length})
                </button>
              </div>

              {/* User overrides tab */}
              {overrideTab === "user" && (
                <>
                  <div className="max-h-48 space-y-1 overflow-y-auto mb-3">
                    {userOverrides.map(o => (
                      <div key={o.id} className="flex items-center justify-between rounded bg-gray-50 px-3 py-1.5 text-xs">
                        <span>
                          {o.override_type === "deny" ? (
                            <ShieldOff size={12} className="inline mr-1 text-red-500" />
                          ) : (
                            <Shield size={12} className="inline mr-1 text-green-500" />
                          )}
                          用户:{getUserName(o.user_id)}
                          <span className={o.override_type === "deny" ? "text-red-600 ml-1" : "text-green-600 ml-1"}>
                            {o.override_type === "deny" ? "禁止查询" : "允许查询"}
                          </span>
                        </span>
                        <button onClick={() => handleDeleteUserOverride(o.id)}
                          className="text-red-400 hover:text-red-600"><X size={12} /></button>
                      </div>
                    ))}
                    {userOverrides.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-2">暂无用户覆盖</p>
                    )}
                  </div>

                  <div className="flex gap-2 border-t pt-3">
                    <select value={newOverrideUserId} onChange={(e) => setNewOverrideUserId(e.target.value)}
                      className="flex-1 rounded border px-2 py-1 text-xs">
                      <option value="">选择用户...</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                    </select>
                    <select value={newOverrideType} onChange={(e) => setNewOverrideType(e.target.value)}
                      className="rounded border px-2 py-1 text-xs">
                      <option value="deny">禁止</option>
                      <option value="allow">允许</option>
                    </select>
                    <button onClick={handleAddUserOverride}
                      className="rounded bg-gray-700 px-3 py-1 text-xs font-medium text-white hover:bg-gray-800">
                      添加
                    </button>
                  </div>
                </>
              )}

              {/* Department overrides tab */}
              {overrideTab === "department" && (
                <>
                  <div className="max-h-48 space-y-1 overflow-y-auto mb-3">
                    {deptOverrides.map(o => (
                      <div key={o.id} className="flex items-center justify-between rounded bg-gray-50 px-3 py-1.5 text-xs">
                        <span>
                          {o.override_type === "deny" ? (
                            <ShieldOff size={12} className="inline mr-1 text-red-500" />
                          ) : (
                            <Shield size={12} className="inline mr-1 text-green-500" />
                          )}
                          部门:{getDeptName(o.department_id)}
                          <span className={o.override_type === "deny" ? "text-red-600 ml-1" : "text-green-600 ml-1"}>
                            {o.override_type === "deny" ? "禁止查询" : "允许查询"}
                          </span>
                        </span>
                        <button onClick={() => handleDeleteDeptOverride(o.id)}
                          className="text-red-400 hover:text-red-600"><X size={12} /></button>
                      </div>
                    ))}
                    {deptOverrides.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-2">暂无部门覆盖</p>
                    )}
                  </div>

                  <div className="flex gap-2 border-t pt-3">
                    <select value={newOverrideDeptId} onChange={(e) => setNewOverrideDeptId(e.target.value)}
                      className="flex-1 rounded border px-2 py-1 text-xs">
                      <option value="">选择部门...</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <select value={newOverrideDeptType} onChange={(e) => setNewOverrideDeptType(e.target.value)}
                      className="rounded border px-2 py-1 text-xs">
                      <option value="deny">禁止</option>
                      <option value="allow">允许</option>
                    </select>
                    <button onClick={handleAddDeptOverride}
                      className="rounded bg-gray-700 px-3 py-1 text-xs font-medium text-white hover:bg-gray-800">
                      添加
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* KB table */}
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
                      <input className="w-full rounded border px-2 py-1 text-sm" value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(kb.id); if (e.key === "Escape") cancelEdit(); }}
                        autoFocus />
                    ) : kb.name}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${kb.type === "enterprise" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}`}>
                      {kb.type === "enterprise" ? "企业" : "个人"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {editingId === kb.id ? (
                      <input className="w-full rounded border px-2 py-1 text-sm" value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(kb.id); if (e.key === "Escape") cancelEdit(); }}
                        placeholder="描述（可选）" />
                    ) : (kb.description || "-")}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${kb.is_active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                      {kb.is_active ? "正常" : "已禁用"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {kb.type === "enterprise" && (
                        <button onClick={() => openOverrides(kb)} className="text-blue-500 hover:text-blue-700" title="权限">
                          <Shield size={16} />
                        </button>
                      )}
                      {editingId === kb.id ? (
                        <>
                          <button onClick={() => saveEdit(kb.id)} className="text-green-500 hover:text-green-700" title="保存"><Check size={16} /></button>
                          <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600" title="取消"><X size={16} /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(kb)} className="text-gray-400 hover:text-gray-600" title="编辑"><Pencil size={16} /></button>
                          <button onClick={() => handleDelete(kb.id)} className="text-red-500 hover:text-red-700" title="删除"><Trash2 size={16} /></button>
                        </>
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
  );
}
