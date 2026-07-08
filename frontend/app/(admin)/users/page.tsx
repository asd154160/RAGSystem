"use client";

import { useEffect, useState, useCallback } from "react";

import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import type { User } from "@/types";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";

interface Role { id: string; name: string; }
interface Department { id: string; name: string; }

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const [form, setForm] = useState({
    username: "", email: "", password: "",
    department_id: "", role_ids: [] as string[],
  });
  const [createError, setCreateError] = useState("");

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    email: "", password: "", department_id: "", role_ids: [] as string[],
    is_active: true,
  });
  const [editError, setEditError] = useState("");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    try {
      const [u, r, d] = await Promise.all([
        apiGet<User[]>("/api/users"),
        apiGet<Role[]>("/api/roles"),
        apiGet<Department[]>("/api/departments"),
      ]);
      setUsers(u);
      setAllRoles(r);
      setDepartments(d);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Create ──

  const openCreate = () => {
    setForm({ username: "", email: "", password: "", department_id: "", role_ids: [] });
    setCreateError("");
    setShowCreate(true);
  };

  async function handleCreate() {
    if (!form.username || !form.email || !form.password) {
      setCreateError("请填写所有必填字段"); return;
    }
    try {
      await apiPost("/api/users", {
        username: form.username,
        email: form.email,
        password: form.password,
        department_id: form.department_id || null,
        role_ids: form.role_ids.length > 0 ? form.role_ids : undefined,
      });
      setShowCreate(false);
      setSuccessMsg("用户创建成功");
      setTimeout(() => setSuccessMsg(""), 3000);
      fetchData();
    } catch (err) { setCreateError(err instanceof Error ? err.message : "创建失败"); }
  }

  // ── Edit ──

  const openEdit = (user: User) => {
    setEditingUserId(user.id);
    setEditForm({
      email: user.email || "",
      password: "",
      department_id: user.department_id || "",
      role_ids: user.roles?.map(r => r.id) || [],
      is_active: user.is_active,
    });
    setEditError("");
    setShowEdit(true);
  };

  async function handleSaveEdit() {
    if (!editingUserId) return;
    try {
      const body: Record<string, unknown> = {
        role_ids: editForm.role_ids,
        department_id: editForm.department_id || null,
        email: editForm.email || null,
        is_active: editForm.is_active,
      };
      if (editForm.password) body.password = editForm.password;
      await apiPatch(`/api/users/${editingUserId}`, body);
      setShowEdit(false);
      setEditingUserId(null);
      setSuccessMsg("用户已更新");
      setTimeout(() => setSuccessMsg(""), 3000);
      fetchData();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "保存失败");
    }
  }

  // ── Delete ──

  async function handleDelete(id: string) {
    if (!confirm("确定删除该用户？")) return;
    try {
      await apiDelete(`/api/users/${id}`);
      setSuccessMsg("用户已删除");
      setTimeout(() => setSuccessMsg(""), 3000);
      fetchData();
    } catch (err) { console.error(err); }
  }

  // ── Helpers ──

  function getUserDeptNames(user: User): string[] {
    const names: string[] = [];
    for (const d of user.departments || []) {
      names.push(d.name);
    }
    const primaryDept = departments.find(d => d.id === user.department_id);
    if (primaryDept && !names.includes(primaryDept.name)) {
      names.unshift(primaryDept.name);
    }
    return names;
  }

  const toggleCreateRole = (roleId: string) => {
    setForm(prev => ({
      ...prev,
      role_ids: prev.role_ids.includes(roleId)
        ? prev.role_ids.filter(id => id !== roleId)
        : [...prev.role_ids, roleId],
    }));
  };

  const toggleEditRole = (roleId: string) => {
    setEditForm(prev => ({
      ...prev,
      role_ids: prev.role_ids.includes(roleId)
        ? prev.role_ids.filter(id => id !== roleId)
        : [...prev.role_ids, roleId],
    }));
  };

  // ── Batch selection ──

  function toggleSelectAll() {
    if (selectedIds.size === users.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(users.map(u => u.id)));
    }
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  }

  async function handleBatchActive(is_active: boolean) {
    const label = is_active ? "启用" : "禁用";
    if (!confirm(`确认批量${label} ${selectedIds.size} 个用户？`)) return;
    try {
      await apiPatch("/api/users/batch/active", {
        user_ids: Array.from(selectedIds),
        is_active,
      });
      setSelectedIds(new Set());
      setSuccessMsg(`已批量${label} ${selectedIds.size} 个用户`);
      setTimeout(() => setSuccessMsg(""), 3000);
      fetchData();
    } catch (err) { alert(err instanceof Error ? err.message : "操作失败"); }
  }

  // ── Loading ──

  if (loading) {
    return <div className="flex items-center justify-center py-20"><p className="text-[var(--color-text-secondary)]">加载中...</p></div>;
  }

  // ── Render ──

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">用户管理</h2>
        <Button variant="primary" onClick={openCreate}>
          <Plus size={16} />新建用户
        </Button>
      </div>

      {/* Success message */}
      {successMsg && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
          {successMsg}
        </div>
      )}

      {/* Batch toolbar */}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-[var(--color-accent)]/20 bg-[var(--color-accent-soft)] px-4 py-2.5">
          <span className="text-sm font-medium text-[var(--color-accent)]">已选择 {selectedIds.size} 项</span>
          <div className="flex gap-2 ml-auto">
            <Button variant="primary" size="sm" onClick={() => handleBatchActive(true)}>批量启用</Button>
            <Button variant="danger" size="sm" onClick={() => handleBatchActive(false)}>批量禁用</Button>
          </div>
        </div>
      )}

      {/* User table */}
      <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--color-border)] bg-white text-left text-[var(--color-text-secondary)]">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={users.length > 0 && selectedIds.size === users.length}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                />
              </th>
              <th className="px-4 py-3 font-medium">用户名</th>
              <th className="px-4 py-3 font-medium">邮箱</th>
              <th className="px-4 py-3 font-medium">部门</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">角色</th>
              <th className="px-4 py-3 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)] text-[var(--color-text-primary)]">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(user.id)}
                    onChange={() => toggleSelect(user.id)}
                    className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                  />
                </td>
                <td className="px-4 py-3 font-medium">{user.username}</td>
                <td className="px-4 py-3">
                  <span className="text-xs text-[var(--color-text-secondary)]">{user.email || "-"}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs">
                    {(() => {
                      const names = getUserDeptNames(user);
                      return names.length > 0
                        ? names.join(", ")
                        : <span className="text-[var(--color-text-secondary)]">-</span>;
                    })()}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={user.is_active ? "success" : "danger"}>
                    {user.is_active ? "正常" : "已禁用"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {user.roles?.map(r => (
                      <Badge key={r.id} variant="default">{r.name}</Badge>
                    ))}
                    {(!user.roles || user.roles.length === 0) && (
                      <span className="text-xs text-[var(--color-text-secondary)]">无角色</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(user)} title="编辑">
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(user.id)} title="删除" className="text-red-500 hover:text-red-700">
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-[var(--color-text-secondary)]">
                  暂无用户
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="新建用户"
        width="sm"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>取消</Button>
            <Button variant="primary" onClick={handleCreate}>创建</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input label="用户名" placeholder="请输入用户名"
            value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <Input label="邮箱" type="email" placeholder="请输入邮箱"
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="密码" type="password" placeholder="请输入密码"
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <div>
            <label className="block mb-1.5 text-sm font-medium text-[var(--color-text-primary)]">部门</label>
            <select
              value={form.department_id}
              onChange={(e) => setForm({ ...form, department_id: e.target.value })}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
            >
              <option value="">无</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block mb-1.5 text-sm font-medium text-[var(--color-text-primary)]">角色（默认 User）</label>
            <div className="flex flex-wrap gap-1.5">
              {allRoles.map(r => (
                <button key={r.id} type="button"
                  onClick={() => toggleCreateRole(r.id)}
                  className={`rounded-full px-2.5 py-0.5 text-xs border transition-colors ${
                    form.role_ids.includes(r.id)
                      ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[var(--color-accent)]/30"
                      : "bg-white text-[var(--color-text-secondary)] border-[var(--color-border)]"
                  }`}
                >{r.name}</button>
              ))}
            </div>
          </div>
          {createError && <p className="text-sm text-red-600">{createError}</p>}
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title="编辑用户"
        width="sm"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="secondary" onClick={() => setShowEdit(false)}>取消</Button>
            <Button variant="primary" onClick={handleSaveEdit}>保存</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">账号状态</span>
            <button
              type="button"
              onClick={() => setEditForm({ ...editForm, is_active: !editForm.is_active })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                editForm.is_active ? "bg-emerald-500" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                  editForm.is_active ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
          <Input label="邮箱" type="email" placeholder="请输入邮箱"
            value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
          <Input label="密码" type="password" placeholder="留空则不修改"
            value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} />
          <div>
            <label className="block mb-1.5 text-sm font-medium text-[var(--color-text-primary)]">部门</label>
            <select
              value={editForm.department_id}
              onChange={(e) => setEditForm({ ...editForm, department_id: e.target.value })}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
            >
              <option value="">无</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block mb-1.5 text-sm font-medium text-[var(--color-text-primary)]">角色</label>
            <div className="flex flex-wrap gap-1.5">
              {allRoles.map(r => (
                <button key={r.id} type="button"
                  onClick={() => toggleEditRole(r.id)}
                  className={`rounded-full px-2.5 py-0.5 text-xs border transition-colors ${
                    editForm.role_ids.includes(r.id)
                      ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[var(--color-accent)]/30"
                      : "bg-white text-[var(--color-text-secondary)] border-[var(--color-border)]"
                  }`}
                >{r.name}</button>
              ))}
            </div>
          </div>
          {editError && <p className="text-sm text-red-600">{editError}</p>}
        </div>
      </Modal>
    </div>
  );
}
