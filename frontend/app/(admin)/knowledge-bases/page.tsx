"use client";

import { useEffect, useState, useCallback } from "react";

import { apiGet, apiPost, apiDelete, apiPatch } from "@/lib/api";
import { Plus, Trash2, Shield, ShieldOff, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/input";

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

  // Create
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", type: "enterprise" });
  const [createError, setCreateError] = useState("");

  // Edit
  const [showEdit, setShowEdit] = useState(false);
  const [editingKbId, setEditingKbId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "" });
  const [editError, setEditError] = useState("");

  // Override management
  const [showOverrides, setShowOverrides] = useState(false);
  const [overrideKbId, setOverrideKbId] = useState<string | null>(null);
  const [overrideKbName, setOverrideKbName] = useState("");
  const [overrideTab, setOverrideTab] = useState<"user" | "department">("user");
  const [userOverrides, setUserOverrides] = useState<UserOverride[]>([]);
  const [deptOverrides, setDeptOverrides] = useState<DepartmentOverride[]>([]);
  const [newOverrideUserId, setNewOverrideUserId] = useState("");
  const [newOverrideType, setNewOverrideType] = useState("allow");
  const [newOverrideDeptId, setNewOverrideDeptId] = useState("");
  const [newOverrideDeptType, setNewOverrideDeptType] = useState("allow");

  // Feedback
  const [successMsg, setSuccessMsg] = useState("");

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

  // ── Create ──

  function openCreate() {
    setForm({ name: "", description: "", type: "enterprise" });
    setCreateError("");
    setShowCreate(true);
  }

  async function handleCreate() {
    if (!form.name.trim()) { setCreateError("请输入知识库名称"); return; }
    try {
      await apiPost("/api/knowledge-bases", form);
      setShowCreate(false);
      setSuccessMsg("知识库创建成功");
      setTimeout(() => setSuccessMsg(""), 3000);
      fetchKbs();
    } catch (err) { setCreateError(err instanceof Error ? err.message : "创建失败"); }
  }

  // ── Edit ──

  function openEdit(kb: KnowledgeBase) {
    setEditingKbId(kb.id);
    setEditForm({ name: kb.name, description: kb.description || "" });
    setEditError("");
    setShowEdit(true);
  }

  async function handleSaveEdit() {
    if (!editingKbId || !editForm.name.trim()) {
      setEditError("请输入知识库名称"); return;
    }
    try {
      await apiPatch(`/api/knowledge-bases/${editingKbId}`, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
      });
      setShowEdit(false);
      setEditingKbId(null);
      setSuccessMsg("知识库已更新");
      setTimeout(() => setSuccessMsg(""), 3000);
      fetchKbs();
    } catch (err) { setEditError(err instanceof Error ? err.message : "保存失败"); }
  }

  // ── Delete ──

  async function handleDelete(id: string) {
    if (!confirm("确定删除该知识库？所有文档将同时删除。")) return;
    try {
      await apiDelete(`/api/knowledge-bases/${id}`);
      setSuccessMsg("知识库已删除");
      setTimeout(() => setSuccessMsg(""), 3000);
      fetchKbs();
    } catch (err) { console.error(err); }
  }

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
    setShowOverrides(true);
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

  // ── Loading ──

  if (loading) {
    return <div className="flex items-center justify-center py-20"><p className="text-[var(--color-text-secondary)]">加载中...</p></div>;
  }

  // ── Render ──

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">知识库管理</h2>
        <Button variant="primary" onClick={openCreate}>
          <Plus size={16} />新建知识库
        </Button>
      </div>

      {/* Success message */}
      {successMsg && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
          {successMsg}
        </div>
      )}

      {/* KB table */}
      <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--color-border)] bg-white text-left text-[var(--color-text-secondary)]">
            <tr>
              <th className="px-4 py-3 font-medium">名称</th>
              <th className="px-4 py-3 font-medium">类型</th>
              <th className="px-4 py-3 font-medium">描述</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)] text-[var(--color-text-primary)]">
            {kbs.map((kb) => (
              <tr key={kb.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{kb.name}</td>
                <td className="px-4 py-3">
                  <Badge variant="default">
                    {kb.type === "enterprise" ? "Enterprise" : "Personal"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-[var(--color-text-secondary)]">{kb.description || "-"}</span>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={kb.is_active ? "success" : "danger"}>
                    {kb.is_active ? "启用" : "禁用"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {kb.type === "enterprise" && (
                      <Button variant="ghost" size="sm" onClick={() => openOverrides(kb)} title="权限">
                        <Shield size={14} />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => openEdit(kb)} title="编辑">
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(kb.id)} title="删除" className="text-red-500 hover:text-red-700">
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {kbs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[var(--color-text-secondary)]">
                  暂无知识库
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
        title="新建知识库"
        width="sm"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>取消</Button>
            <Button variant="primary" onClick={handleCreate}>创建</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input label="知识库名称" placeholder="请输入知识库名称"
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Textarea label="描述" placeholder="描述（可选）" rows={3}
            value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div>
            <label className="block mb-1.5 text-sm font-medium text-[var(--color-text-primary)]">类型</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
            >
              <option value="enterprise">企业知识库</option>
              <option value="personal">个人知识库</option>
            </select>
          </div>
          {createError && <p className="text-sm text-red-600">{createError}</p>}
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title="编辑知识库"
        width="sm"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="secondary" onClick={() => setShowEdit(false)}>取消</Button>
            <Button variant="primary" onClick={handleSaveEdit}>保存</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input label="知识库名称" placeholder="请输入知识库名称"
            value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          <Textarea label="描述" placeholder="描述（可选）" rows={3}
            value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
          {editError && <p className="text-sm text-red-600">{editError}</p>}
        </div>
      </Modal>

      {/* Override Modal */}
      <Modal
        open={showOverrides}
        onClose={() => setShowOverrides(false)}
        title={`${overrideKbName} — 查询权限管理`}
        width="md"
      >
        <p className="text-xs text-[var(--color-text-secondary)] mb-3">
          默认所有用户可查询。用户级覆盖优先级高于部门级。
        </p>

        {/* Tab bar */}
        <div className="flex border-b border-[var(--color-border)] mb-3">
          <button
            onClick={() => setOverrideTab("user")}
            className={`px-4 py-1.5 text-xs font-medium border-b-2 transition-colors ${
              overrideTab === "user"
                ? "border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]"
                : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            用户覆盖 ({userOverrides.length})
          </button>
          <button
            onClick={() => setOverrideTab("department")}
            className={`px-4 py-1.5 text-xs font-medium border-b-2 transition-colors ${
              overrideTab === "department"
                ? "border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]"
                : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
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
                  <span className="text-[var(--color-text-primary)]">
                    {o.override_type === "deny" ? (
                      <ShieldOff size={12} className="inline mr-1 text-red-500" />
                    ) : (
                      <Shield size={12} className="inline mr-1 text-emerald-500" />
                    )}
                    用户: {getUserName(o.user_id)}
                    <span className={o.override_type === "deny" ? "text-red-600 ml-1" : "text-emerald-600 ml-1"}>
                      {o.override_type === "deny" ? "禁止查询" : "允许查询"}
                    </span>
                  </span>
                  <button onClick={() => handleDeleteUserOverride(o.id)}
                    className="text-red-400 hover:text-red-600"><X size={12} /></button>
                </div>
              ))}
              {userOverrides.length === 0 && (
                <p className="text-xs text-[var(--color-text-secondary)] text-center py-2">暂无用户覆盖</p>
              )}
            </div>

            <div className="flex gap-2 border-t border-[var(--color-border)] pt-3">
              <select value={newOverrideUserId} onChange={(e) => setNewOverrideUserId(e.target.value)}
                className="flex-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20">
                <option value="">选择用户...</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
              </select>
              <select value={newOverrideType} onChange={(e) => setNewOverrideType(e.target.value)}
                className="rounded-lg border border-[var(--color-border)] px-2 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20">
                <option value="deny">禁止</option>
                <option value="allow">允许</option>
              </select>
              <Button variant="primary" size="sm" onClick={handleAddUserOverride}>
                添加
              </Button>
            </div>
          </>
        )}

        {/* Department overrides tab */}
        {overrideTab === "department" && (
          <>
            <div className="max-h-48 space-y-1 overflow-y-auto mb-3">
              {deptOverrides.map(o => (
                <div key={o.id} className="flex items-center justify-between rounded bg-gray-50 px-3 py-1.5 text-xs">
                  <span className="text-[var(--color-text-primary)]">
                    {o.override_type === "deny" ? (
                      <ShieldOff size={12} className="inline mr-1 text-red-500" />
                    ) : (
                      <Shield size={12} className="inline mr-1 text-emerald-500" />
                    )}
                    部门: {getDeptName(o.department_id)}
                    <span className={o.override_type === "deny" ? "text-red-600 ml-1" : "text-emerald-600 ml-1"}>
                      {o.override_type === "deny" ? "禁止查询" : "允许查询"}
                    </span>
                  </span>
                  <button onClick={() => handleDeleteDeptOverride(o.id)}
                    className="text-red-400 hover:text-red-600"><X size={12} /></button>
                </div>
              ))}
              {deptOverrides.length === 0 && (
                <p className="text-xs text-[var(--color-text-secondary)] text-center py-2">暂无部门覆盖</p>
              )}
            </div>

            <div className="flex gap-2 border-t border-[var(--color-border)] pt-3">
              <select value={newOverrideDeptId} onChange={(e) => setNewOverrideDeptId(e.target.value)}
                className="flex-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20">
                <option value="">选择部门...</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select value={newOverrideDeptType} onChange={(e) => setNewOverrideDeptType(e.target.value)}
                className="rounded-lg border border-[var(--color-border)] px-2 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20">
                <option value="deny">禁止</option>
                <option value="allow">允许</option>
              </select>
              <Button variant="primary" size="sm" onClick={handleAddDeptOverride}>
                添加
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
