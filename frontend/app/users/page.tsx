"use client";

import { useEffect, useState, useCallback } from "react";
import AdminLayout from "@/components/layout/admin-layout";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import type { User } from "@/types";
import { Plus, Trash2, X, Save, Edit3 } from "lucide-react";

interface Role { id: string; name: string; }
interface RoleBrief { id: string; name: string; description?: string | null; }

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: "", email: "", password: "", role_ids: [] as string[] });
  const [error, setError] = useState("");

  // Editing state
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editRoles, setEditRoles] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [u, r] = await Promise.all([
        apiGet<User[]>("/api/users"),
        apiGet<Role[]>("/api/roles"),
      ]);
      setUsers(u);
      setAllRoles(r);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleCreate() {
    if (!form.username || !form.email || !form.password) {
      setError("请填写所有字段");
      return;
    }
    try {
      await apiPost("/api/users", { ...form, role_ids: form.role_ids.length > 0 ? form.role_ids : undefined });
      setShowForm(false);
      setForm({ username: "", email: "", password: "", role_ids: [] });
      setError("");
      fetchData();
    } catch (err) { setError(err instanceof Error ? err.message : "创建失败"); }
  }

  async function handleDelete(id: string) {
    if (!confirm("确定删除该用户？")) return;
    try { await apiDelete(`/api/users/${id}`); fetchData(); }
    catch (err) { console.error(err); }
  }

  const startEditRoles = (user: User) => {
    setEditingUser(user.id);
    setEditRoles(user.roles?.map(r => r.id) || []);
  };

  const cancelEditRoles = () => { setEditingUser(null); };

  const handleSaveRoles = async (userId: string) => {
    await apiPatch(`/api/users/${userId}`, { role_ids: editRoles });
    setEditingUser(null);
    fetchData();
  };

  const toggleRole = (roleId: string) => {
    setEditRoles(prev => prev.includes(roleId) ? prev.filter(id => id !== roleId) : [...prev, roleId]);
  };

  // Find User role ID for default
  const userRoleId = allRoles.find(r => r.name === "User")?.id || "";

  if (loading) {
    return <AdminLayout><div className="flex items-center justify-center py-20"><p className="text-gray-500">加载中...</p></div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">用户管理</h2>
          <button
            onClick={() => {
              const defaultRoleId = allRoles.find(r => r.name === "User")?.id;
              setForm({ username: "", email: "", password: "", role_ids: defaultRoleId ? [defaultRoleId] : [] });
              setShowForm(true);
            }}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus size={16} /> 新建用户
          </button>
        </div>

        {/* Create form modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">新建用户</h3>
                <button onClick={() => setShowForm(false)}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
              </div>
              <div className="space-y-3">
                <input className="w-full rounded-md border px-3 py-2 text-sm" placeholder="用户名"
                  value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                <input className="w-full rounded-md border px-3 py-2 text-sm" placeholder="邮箱" type="email"
                  value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <input className="w-full rounded-md border px-3 py-2 text-sm" placeholder="密码" type="password"
                  value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                {/* Role selection */}
                <div>
                  <p className="text-xs text-gray-500 mb-1.5">角色（默认 User）</p>
                  <div className="flex flex-wrap gap-1.5">
                    {allRoles.map(r => (
                      <button key={r.id}
                        onClick={() => setForm({
                          ...form,
                          role_ids: form.role_ids.includes(r.id)
                            ? form.role_ids.filter(id => id !== r.id)
                            : [...form.role_ids, r.id]
                        })}
                        className={`rounded-full px-2.5 py-0.5 text-xs border transition-colors ${
                          form.role_ids.includes(r.id) ? "bg-blue-100 text-blue-700 border-blue-300" : "bg-white text-gray-500 border-gray-200"}`}
                      >{r.name}</button>
                    ))}
                  </div>
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button onClick={handleCreate}
                  className="w-full rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700">创建</button>
              </div>
            </div>
          </div>
        )}

        {/* User table */}
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">用户名</th>
                <th className="px-4 py-3 font-medium">邮箱</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">角色</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y text-gray-700">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{user.username}</td>
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      user.is_active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                      {user.is_active ? "正常" : "已禁用"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {editingUser === user.id ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap gap-1">
                          {allRoles.map(r => (
                            <button key={r.id}
                              onClick={() => toggleRole(r.id)}
                              className={`rounded-full px-2 py-0.5 text-xs border ${
                                editRoles.includes(r.id) ? "bg-blue-100 text-blue-700 border-blue-300" : "bg-white text-gray-400 border-gray-200"}`}
                            >{r.name}</button>
                          ))}
                        </div>
                        <div className="flex gap-1 mt-1">
                          <button onClick={() => handleSaveRoles(user.id)}
                            className="text-green-600 hover:text-green-700"><Save size={14} /></button>
                          <button onClick={cancelEditRoles}
                            className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-xs">
                          {user.roles?.map(r => r.name).join(", ") || <span className="text-gray-400">无角色</span>}
                        </span>
                        <button onClick={() => startEditRoles(user)}
                          className="ml-1 text-gray-300 hover:text-blue-500"><Edit3 size={12} /></button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(user.id)} className="text-red-500 hover:text-red-700">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
