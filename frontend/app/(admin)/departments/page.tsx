"use client";

import { useEffect, useState, useCallback } from "react";

import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { Plus, Trash2, Users, UserPlus, UserX, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/input";

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

  // Create
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [createError, setCreateError] = useState("");

  // Edit
  const [showEdit, setShowEdit] = useState(false);
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "" });
  const [editError, setEditError] = useState("");

  // Members
  const [showMembers, setShowMembers] = useState(false);
  const [memberDeptId, setMemberDeptId] = useState<string | null>(null);
  const [memberDeptName, setMemberDeptName] = useState("");
  const [addUserId, setAddUserId] = useState("");

  // Feedback
  const [successMsg, setSuccessMsg] = useState("");

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

  // ── Create ──

  function openCreate() {
    setForm({ name: "", description: "" });
    setCreateError("");
    setShowCreate(true);
  }

  async function handleCreate() {
    if (!form.name.trim()) { setCreateError("请输入部门名称"); return; }
    try {
      await apiPost("/api/departments", form);
      setShowCreate(false);
      setSuccessMsg("部门创建成功");
      setTimeout(() => setSuccessMsg(""), 3000);
      fetchDepts();
    } catch (err) { setCreateError(err instanceof Error ? err.message : "创建失败"); }
  }

  // ── Edit ──

  function openEdit(dept: Department) {
    setEditingDeptId(dept.id);
    setEditForm({ name: dept.name, description: dept.description || "" });
    setEditError("");
    setShowEdit(true);
  }

  async function handleSaveEdit() {
    if (!editingDeptId || !editForm.name.trim()) {
      setEditError("请输入部门名称"); return;
    }
    try {
      await apiPatch(`/api/departments/${editingDeptId}`, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
      });
      setShowEdit(false);
      setEditingDeptId(null);
      setSuccessMsg("部门已更新");
      setTimeout(() => setSuccessMsg(""), 3000);
      fetchDepts();
    } catch (err) { setEditError(err instanceof Error ? err.message : "保存失败"); }
  }

  // ── Delete ──

  async function handleDelete(id: string) {
    if (!confirm("确定删除该部门？")) return;
    try {
      await apiDelete(`/api/departments/${id}`);
      setSuccessMsg("部门已删除");
      setTimeout(() => setSuccessMsg(""), 3000);
      fetchDepts();
    } catch (err) { console.error(err); }
  }

  // ── Members ──

  function openMembers(dept: Department) {
    setMemberDeptId(dept.id);
    setMemberDeptName(dept.name);
    setAddUserId("");
    setShowMembers(true);
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

  // ── Loading ──

  if (loading) {
    return <div className="flex items-center justify-center py-20"><p className="text-[var(--color-text-secondary)]">加载中...</p></div>;
  }

  // ── Render ──

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">部门管理</h2>
        <Button variant="primary" onClick={openCreate}>
          <Plus size={16} />新建部门
        </Button>
      </div>

      {/* Success message */}
      {successMsg && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
          {successMsg}
        </div>
      )}

      {/* Department table */}
      <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--color-border)] bg-white text-left text-[var(--color-text-secondary)]">
            <tr>
              <th className="px-4 py-3 font-medium">部门名称</th>
              <th className="px-4 py-3 font-medium">描述</th>
              <th className="px-4 py-3 font-medium">成员</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">创建时间</th>
              <th className="px-4 py-3 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)] text-[var(--color-text-primary)]">
            {departments.map((dept) => (
              <tr key={dept.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{dept.name}</td>
                <td className="px-4 py-3">
                  <span className="text-xs text-[var(--color-text-secondary)]">{dept.description || "-"}</span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => openMembers(dept)}
                    className="inline-flex items-center gap-1 text-[var(--color-accent)] hover:opacity-80"
                  >
                    <Users size={14} />
                    <span className="text-xs">{dept.members.length}人</span>
                    {dept.user_count > 0 && (
                      <span className="text-[var(--color-text-secondary)] text-xs">（{dept.user_count}直属）</span>
                    )}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={dept.is_active ? "success" : "danger"}>
                    {dept.is_active ? "启用" : "禁用"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)]">
                  {new Date(dept.created_at).toLocaleDateString("zh-CN")}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(dept)} title="编辑">
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(dept.id)} title="删除" className="text-red-500 hover:text-red-700">
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {departments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[var(--color-text-secondary)]">
                  暂无部门
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
        title="新建部门"
        width="sm"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>取消</Button>
            <Button variant="primary" onClick={handleCreate}>创建</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input label="部门名称" placeholder="请输入部门名称"
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Textarea label="描述" placeholder="描述（可选）" rows={3}
            value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          {createError && <p className="text-sm text-red-600">{createError}</p>}
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title="编辑部门"
        width="sm"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="secondary" onClick={() => setShowEdit(false)}>取消</Button>
            <Button variant="primary" onClick={handleSaveEdit}>保存</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input label="部门名称" placeholder="请输入部门名称"
            value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          <Textarea label="描述" placeholder="描述（可选）" rows={3}
            value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
          {editError && <p className="text-sm text-red-600">{editError}</p>}
        </div>
      </Modal>

      {/* Member Modal */}
      <Modal
        open={showMembers}
        onClose={() => setShowMembers(false)}
        title={`${memberDeptName} — 管理成员`}
        width="md"
      >
        {/* Current members */}
        <div className="mb-4">
          <p className="text-xs text-[var(--color-text-secondary)] mb-2">当前成员（{currentDept?.members.length || 0}人）</p>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {currentDept?.members.map(m => (
              <div key={m.id} className="flex items-center justify-between rounded bg-gray-50 px-3 py-1.5 text-sm">
                <span className="text-[var(--color-text-primary)]">{m.username}
                  <span className="text-[var(--color-text-secondary)] text-xs ml-1">{m.email}</span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => handleRemoveMember(m.id)} className="text-red-400 hover:text-red-600">
                  <UserX size={14} />
                </Button>
              </div>
            ))}
            {currentDept?.members.length === 0 && (
              <p className="text-sm text-[var(--color-text-secondary)] text-center py-4">暂无成员</p>
            )}
          </div>
        </div>

        {/* Add member */}
        <div className="flex gap-2 border-t border-[var(--color-border)] pt-3">
          <select
            value={addUserId}
            onChange={(e) => setAddUserId(e.target.value)}
            className="flex-1 rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
          >
            <option value="">选择用户...</option>
            {availableUsers.map(u => (
              <option key={u.id} value={u.id}>{u.username} ({u.email})</option>
            ))}
          </select>
          <Button variant="primary" size="sm" onClick={handleAddMember} disabled={!addUserId}>
            <UserPlus size={14} />添加
          </Button>
        </div>
      </Modal>
    </div>
  );
}
