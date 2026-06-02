"use client";

import { useEffect, useState, useCallback } from "react";
import AdminLayout from "@/components/layout/admin-layout";
import { apiGet, apiPost, apiDelete, apiPatch } from "@/lib/api";
import { Plus, Trash2, X, Pencil, Check, Shield, ShieldOff } from "lucide-react";

interface KnowledgeBase {
  id: string; name: string; description: string | null;
  type: string; is_active: boolean; created_at: string;
}

interface KBPermission {
  id: string; knowledge_base_id: string;
  role_id: string | null; department_id: string | null; user_id: string | null;
  permission_type: string;
  role_name?: string | null; department_name?: string | null; user_name?: string | null;
}

interface UserOverride {
  id: string; user_id: string; knowledge_base_id: string; override_type: string;
}

interface Role { id: string; name: string; }
interface Department { id: string; name: string; }
interface UserBrief { id: string; username: string; email: string; }

const PERM_TYPES = ["view", "query", "upload", "review", "publish", "manage", "delete"];
const PERM_LABELS: Record<string, string> = {
  view: "查看", query: "查询", upload: "上传", review: "审核",
  publish: "发布", manage: "管理", delete: "删除",
};

export default function KnowledgeBasesPage() {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<UserBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", type: "enterprise" });
  const [error, setError] = useState("");

  // Permission management state
  const [permKbId, setPermKbId] = useState<string | null>(null);
  const [permKbName, setPermKbName] = useState("");
  const [permissions, setPermissions] = useState<KBPermission[]>([]);
  const [overrides, setOverrides] = useState<UserOverride[]>([]);
  const [permLoading, setPermLoading] = useState(false);

  // "Add permission" form state
  const [newPermType, setNewPermType] = useState("role"); // role | department | user
  const [newPermRoleId, setNewPermRoleId] = useState("");
  const [newPermDeptId, setNewPermDeptId] = useState("");
  const [newPermUserId, setNewPermUserId] = useState("");
  const [newPermAction, setNewPermAction] = useState("query");

  // "Add override" form state
  const [newOverrideUserId, setNewOverrideUserId] = useState("");
  const [newOverrideType, setNewOverrideType] = useState("allow");

  const fetchKbs = useCallback(async () => {
    try {
      const data = await apiGet<KnowledgeBase[]>("/api/knowledge-bases");
      setKbs(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  const fetchMeta = useCallback(async () => {
    try {
      const [r, d, u] = await Promise.all([
        apiGet<Role[]>("/api/roles"),
        apiGet<Department[]>("/api/departments"),
        apiGet<UserBrief[]>("/api/users"),
      ]);
      setRoles(r); setDepartments(d); setUsers(u);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { fetchKbs(); fetchMeta(); }, [fetchKbs, fetchMeta]);

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

  // ── Permission management ──

  async function openPermissions(kb: KnowledgeBase) {
    setPermKbId(kb.id);
    setPermKbName(kb.name);
    setNewPermRoleId(""); setNewPermDeptId(""); setNewPermUserId("");
    setNewPermAction("query"); setNewOverrideUserId(""); setNewOverrideType("allow");
    setPermLoading(true);
    try {
      const [p, o] = await Promise.all([
        apiGet<KBPermission[]>(`/api/knowledge-bases/${kb.id}/permissions`),
        apiGet<UserOverride[]>(`/api/knowledge-bases/${kb.id}/user-overrides`),
      ]);
      setPermissions(p); setOverrides(o);
    } catch (err) { console.error(err); }
    finally { setPermLoading(false); }
  }

  async function handleAddPermission() {
    if (!permKbId) return;
    const body: Record<string, string> = { permission_type: newPermAction };
    if (newPermType === "role") { body.role_id = newPermRoleId; }
    else if (newPermType === "department") { body.department_id = newPermDeptId; }
    else { body.user_id = newPermUserId; }

    const valid = (newPermType === "role" && newPermRoleId) ||
      (newPermType === "department" && newPermDeptId) ||
      (newPermType === "user" && newPermUserId);
    if (!valid) return;

    try {
      await apiPost(`/api/knowledge-bases/${permKbId}/permissions`, body);
      // Refresh permissions
      const p = await apiGet<KBPermission[]>(`/api/knowledge-bases/${permKbId}/permissions`);
      setPermissions(p);
      setNewPermRoleId(""); setNewPermDeptId(""); setNewPermUserId("");
    } catch (err) { console.error(err); }
  }

  async function handleDeletePermission(permId: string) {
    if (!permKbId) return;
    try {
      await apiDelete(`/api/knowledge-bases/${permKbId}/permissions/${permId}`);
      setPermissions(prev => prev.filter(p => p.id !== permId));
    } catch (err) { console.error(err); }
  }

  async function handleAddOverride() {
    if (!permKbId || !newOverrideUserId) return;
    try {
      await apiPost(`/api/knowledge-bases/${permKbId}/user-overrides`, {
        user_id: newOverrideUserId, override_type: newOverrideType,
      });
      const o = await apiGet<UserOverride[]>(`/api/knowledge-bases/${permKbId}/user-overrides`);
      setOverrides(o);
      setNewOverrideUserId("");
    } catch (err) { console.error(err); }
  }

  async function handleDeleteOverride(overrideId: string) {
    if (!permKbId) return;
    try {
      await apiDelete(`/api/knowledge-bases/${permKbId}/user-overrides/${overrideId}`);
      setOverrides(prev => prev.filter(o => o.id !== overrideId));
    } catch (err) { console.error(err); }
  }

  function getUserName(uid: string) {
    return users.find(u => u.id === uid)?.username || uid.slice(0, 8);
  }

  // ── Render ──

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

        {/* Permission management modal */}
        {permKbId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl max-h-[85vh] overflow-y-auto">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">
                  <Shield size={16} className="inline mr-1.5" />
                  {permKbName} — 权限管理
                </h3>
                <button onClick={() => setPermKbId(null)}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
              </div>

              {permLoading ? (
                <p className="text-sm text-gray-400 py-8 text-center">加载中...</p>
              ) : (
                <>
                  {/* Current permissions */}
                  <div className="mb-5">
                    <p className="text-xs text-gray-500 mb-2">
                      当前权限（{permissions.length}条）
                      {permissions.length === 0 && " — 无权限配置时，知识库对全员开放"}
                    </p>
                    <div className="max-h-44 space-y-1 overflow-y-auto">
                      {permissions.map(p => (
                        <div key={p.id} className="flex items-center justify-between rounded bg-gray-50 px-3 py-1.5 text-xs">
                          <span>
                            <span className="font-medium text-gray-600 mr-2">
                              [{PERM_LABELS[p.permission_type] || p.permission_type}]
                            </span>
                            {p.role_name && <span className="text-blue-600">角色:{p.role_name}</span>}
                            {p.department_name && <span className="text-purple-600">部门:{p.department_name}</span>}
                            {p.user_name && <span className="text-green-600">用户:{p.user_name}</span>}
                          </span>
                          <button onClick={() => handleDeletePermission(p.id)}
                            className="text-red-400 hover:text-red-600"><X size={12} /></button>
                        </div>
                      ))}
                      {permissions.length === 0 && (
                        <p className="text-xs text-gray-400 text-center py-2">暂无权限配置，知识库对全员开放</p>
                      )}
                    </div>
                  </div>

                  {/* Add permission */}
                  <div className="mb-5 border-t pt-4">
                    <p className="text-xs text-gray-500 mb-2">添加权限</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      <select value={newPermType} onChange={(e) => setNewPermType(e.target.value)}
                        className="rounded border px-2 py-1 text-xs">
                        <option value="role">按角色</option>
                        <option value="department">按部门</option>
                        <option value="user">按用户</option>
                      </select>
                      {newPermType === "role" && (
                        <select value={newPermRoleId} onChange={(e) => setNewPermRoleId(e.target.value)}
                          className="flex-1 rounded border px-2 py-1 text-xs min-w-[120px]">
                          <option value="">选择角色...</option>
                          {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      )}
                      {newPermType === "department" && (
                        <select value={newPermDeptId} onChange={(e) => setNewPermDeptId(e.target.value)}
                          className="flex-1 rounded border px-2 py-1 text-xs min-w-[120px]">
                          <option value="">选择部门...</option>
                          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      )}
                      {newPermType === "user" && (
                        <select value={newPermUserId} onChange={(e) => setNewPermUserId(e.target.value)}
                          className="flex-1 rounded border px-2 py-1 text-xs min-w-[120px]">
                          <option value="">选择用户...</option>
                          {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                        </select>
                      )}
                      <select value={newPermAction} onChange={(e) => setNewPermAction(e.target.value)}
                        className="rounded border px-2 py-1 text-xs">
                        {PERM_TYPES.map(t => <option key={t} value={t}>{PERM_LABELS[t]}</option>)}
                      </select>
                      <button onClick={handleAddPermission}
                        className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700">
                        添加
                      </button>
                    </div>
                  </div>

                  {/* User overrides */}
                  <div className="border-t pt-4">
                    <p className="text-xs text-gray-500 mb-2">用户级覆盖（允许/拒绝，优先级最高）</p>
                    <div className="max-h-32 space-y-1 overflow-y-auto mb-2">
                      {overrides.map(o => (
                        <div key={o.id} className="flex items-center justify-between rounded bg-gray-50 px-3 py-1.5 text-xs">
                          <span>
                            {o.override_type === "deny" ? (
                              <ShieldOff size={12} className="inline mr-1 text-red-500" />
                            ) : (
                              <Shield size={12} className="inline mr-1 text-green-500" />
                            )}
                            用户:{getUserName(o.user_id)}
                            <span className={o.override_type === "deny" ? "text-red-600 ml-1" : "text-green-600 ml-1"}>
                              {o.override_type === "deny" ? "拒绝" : "允许"}
                            </span>
                          </span>
                          <button onClick={() => handleDeleteOverride(o.id)}
                            className="text-red-400 hover:text-red-600"><X size={12} /></button>
                        </div>
                      ))}
                      {overrides.length === 0 && (
                        <p className="text-xs text-gray-400 text-center py-1">无用户覆盖</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <select value={newOverrideUserId} onChange={(e) => setNewOverrideUserId(e.target.value)}
                        className="flex-1 rounded border px-2 py-1 text-xs">
                        <option value="">选择用户...</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                      </select>
                      <select value={newOverrideType} onChange={(e) => setNewOverrideType(e.target.value)}
                        className="rounded border px-2 py-1 text-xs">
                        <option value="allow">允许</option>
                        <option value="deny">拒绝</option>
                      </select>
                      <button onClick={handleAddOverride}
                        className="rounded bg-gray-600 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700">
                        添加
                      </button>
                    </div>
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
                        <button onClick={() => openPermissions(kb)} className="text-blue-500 hover:text-blue-700" title="权限">
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
    </AdminLayout>
  );
}
