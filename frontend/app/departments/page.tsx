"use client";

import { useEffect, useState, useCallback } from "react";
import AdminLayout from "@/components/layout/admin-layout";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { Plus, Trash2, X, Users, UserPlus, UserX } from "lucide-react";

interface Member {
  id: string; username: string; email: string;
}

interface Department {
  id: string; name: string; description: string | null;
  parent_id: string | null; is_active: boolean; created_at: string;
  members: Member[]; user_count: number;
}

interface UserBrief {
  id: string; username: string; email: string;
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [allUsers, setAllUsers] = useState<UserBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [error, setError] = useState("");

  // Member management
  const [memberDeptId, setMemberDeptId] = useState<string | null>(null);
  const [memberDeptName, setMemberDeptName] = useState("");
  const [addUserId, setAddUserId] = useState("");

  const fetchDepts = useCallback(async () => {
    try {
      const data = await apiGet<Department[]>("/api/departments");
      setDepartments(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await apiGet<UserBrief[]>("/api/users");
      setAllUsers(data);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { fetchDepts(); fetchUsers(); }, [fetchDepts, fetchUsers]);

  async function handleCreate() {
    if (!form.name.trim()) { setError("请输入部门名称"); return; }
    try {
      await apiPost("/api/departments", form);
      setShowForm(false);
      setForm({ name: "", description: "" });
      setError("");
      fetchDepts();
    } catch (err) { setError(err instanceof Error ? err.message : "创建失败"); }
  }

  async function handleDelete(id: string) {
    if (!confirm("确定删除该部门？")) return;
    try { await apiDelete(`/api/departments/${id}`); fetchDepts(); }
    catch (err) { console.error(err); }
  }

  function openMembers(dept: Department) {
    setMemberDeptId(dept.id);
    setMemberDeptName(dept.name);
    setAddUserId("");
  }

  async function handleAddMember() {
    if (!addUserId || !memberDeptId) return;
    try {
      await apiPost(`/api/departments/${memberDeptId}/members`, { user_id: addUserId });
      setAddUserId("");
      fetchDepts();
    } catch (err) { console.error(err); }
  }

  async function handleRemoveMember(userId: string) {
    if (!memberDeptId) return;
    try {
      await apiDelete(`/api/departments/${memberDeptId}/members/${userId}`);
      fetchDepts();
    } catch (err) { console.error(err); }
  }

  const currentDept = departments.find(d => d.id === memberDeptId);
  const availableUsers = allUsers.filter(
    u => !currentDept?.members.some(m => m.id === u.id)
  );

  if (loading) {
    return <AdminLayout><div className="flex items-center justify-center py-20"><p className="text-gray-500">加载中...</p></div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">部门管理</h2>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus size={16} />新建部门
          </button>
        </div>

        {/* Create form modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">新建部门</h3>
                <button onClick={() => setShowForm(false)}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
              </div>
              <div className="space-y-3">
                <input className="w-full rounded-md border px-3 py-2 text-sm" placeholder="部门名称"
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <input className="w-full rounded-md border px-3 py-2 text-sm" placeholder="描述（可选）"
                  value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button onClick={handleCreate} className="w-full rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700">创建</button>
              </div>
            </div>
          </div>
        )}

        {/* Member management modal */}
        {memberDeptId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">
                  <Users size={16} className="inline mr-1.5" />
                  {memberDeptName} — 成员管理
                </h3>
                <button onClick={() => setMemberDeptId(null)}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
              </div>

              {/* Current members */}
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2">当前成员（{currentDept?.members.length || 0}人）</p>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {currentDept?.members.map(m => (
                    <div key={m.id} className="flex items-center justify-between rounded bg-gray-50 px-3 py-1.5 text-sm">
                      <span>{m.username} <span className="text-gray-400 text-xs">{m.email}</span></span>
                      <button onClick={() => handleRemoveMember(m.id)} className="text-red-400 hover:text-red-600">
                        <UserX size={14} />
                      </button>
                    </div>
                  ))}
                  {currentDept?.members.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">暂无成员</p>
                  )}
                </div>
              </div>

              {/* Add member */}
              <div className="flex gap-2">
                <select
                  value={addUserId}
                  onChange={(e) => setAddUserId(e.target.value)}
                  className="flex-1 rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">选择用户...</option>
                  {availableUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.username} ({u.email})</option>
                  ))}
                </select>
                <button
                  onClick={handleAddMember}
                  disabled={!addUserId}
                  className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  <UserPlus size={14} />添加
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Department table */}
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">部门名称</th>
                <th className="px-4 py-3 font-medium">描述</th>
                <th className="px-4 py-3 font-medium">成员</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">创建时间</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y text-gray-700">
              {departments.map((dept) => (
                <tr key={dept.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{dept.name}</td>
                  <td className="px-4 py-3">{dept.description || "-"}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openMembers(dept)}
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                    >
                      <Users size={14} />
                      <span>{dept.members.length}人</span>
                      {dept.user_count > 0 && (
                        <span className="text-gray-400">（{dept.user_count}直属）</span>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      dept.is_active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                      {dept.is_active ? "正常" : "已禁用"}
                    </span>
                  </td>
                  <td className="px-4 py-3">{new Date(dept.created_at).toLocaleDateString("zh-CN")}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(dept.id)} className="text-red-500 hover:text-red-700">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {departments.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">暂无部门</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
