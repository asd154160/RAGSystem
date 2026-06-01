"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/layout/admin-layout";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { Plus, Trash2, Save, X, Shield, Key } from "lucide-react";

interface Permission {
  id: string; code: string; description: string;
}
interface Role {
  id: string; name: string; description: string | null;
  permissions: Permission[];
}

const PERMISSION_LABELS: Record<string, string> = {
  manage_user: "用户管理",
  manage_department: "部门管理",
  manage_knowledge_base: "知识库管理",
  upload_document: "文档上传",
  review_document: "文档审核",
  publish_document: "文档发布",
  query_knowledge_base: "知识库查询",
  manage_model_config: "模型配置",
  view_audit_logs: "审计日志",
};

export default function PermissionsPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit state
  const [editing, setEditing] = useState<Role | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);

  // New role state
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([
        apiGet<Role[]>("/api/roles"),
        apiGet<Permission[]>("/api/roles/permissions"),
      ]);
      setRoles(r);
      setAllPermissions(p);
    } catch {}
    setLoading(false);
  };

  const startEdit = (role: Role) => {
    setEditing(role);
    setEditName(role.name);
    setEditDesc(role.description || "");
    setSelectedPerms(role.permissions.map(p => p.id));
    setShowNew(false);
  };

  const cancelEdit = () => {
    setEditing(null);
    setShowNew(false);
  };

  const handleSave = async () => {
    if (!editing) return;
    await apiPatch(`/api/roles/${editing.id}`, {
      name: editName,
      description: editDesc,
      permission_ids: selectedPerms,
    });
    cancelEdit();
    loadData();
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await apiPost("/api/roles", { name: newName, description: newDesc, permission_ids: [] });
    setShowNew(false);
    setNewName("");
    setNewDesc("");
    loadData();
  };

  const handleDelete = async (roleId: string) => {
    if (!confirm("确定删除该角色？")) return;
    await apiDelete(`/api/roles/${roleId}`);
    loadData();
  };

  const togglePerm = (permId: string) => {
    setSelectedPerms(prev =>
      prev.includes(permId) ? prev.filter(id => id !== permId) : [...prev, permId]
    );
  };

  if (loading) return <AdminLayout><div className="p-8">加载中...</div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-800">权限管理</h2>
          <button
            onClick={() => { setShowNew(true); setEditing(null); }}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            <Plus size={16} /> 新建角色
          </button>
        </div>

        {/* New Role Form */}
        {showNew && (
          <div className="mb-6 rounded-lg border bg-white p-4">
            <div className="flex items-center gap-3 mb-3">
              <Shield size={18} className="text-blue-500" />
              <input
                value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="角色名称" autoFocus
                className="flex-1 rounded border px-3 py-2 text-sm"
              />
              <input
                value={newDesc} onChange={e => setNewDesc(e.target.value)}
                placeholder="描述"
                className="flex-1 rounded border px-3 py-2 text-sm"
              />
              <button onClick={handleCreate}
                className="flex items-center gap-1 rounded-md bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700">
                <Plus size={14} /> 创建
              </button>
              <button onClick={cancelEdit} className="p-2 text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
          </div>
        )}

        {/* All Permissions Legend */}
        <div className="mb-6 flex flex-wrap gap-2">
          <span className="text-xs text-gray-500 mr-2 mt-1">全部权限：</span>
          {allPermissions.map(p => (
            <span key={p.id}
              className="inline-flex items-center gap-1 rounded-full border bg-gray-50 px-2.5 py-0.5 text-xs text-gray-600"
            >
              <Key size={10} /> {PERMISSION_LABELS[p.code] || p.code}
            </span>
          ))}
        </div>

        {/* Roles List */}
        <div className="space-y-3">
          {roles.map(role => (
            <div key={role.id} className="rounded-lg border bg-white">
              {/* Role Header */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <Shield size={18} className="text-blue-500" />
                  <div>
                    <span className="font-medium text-sm">{role.name}</span>
                    <span className="ml-2 text-xs text-gray-400">{role.description}</span>
                  </div>
                  <span className="text-xs text-gray-400">{role.permissions.length} 个权限</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEdit(role)}
                    className="rounded p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-500"
                  >
                    <Save size={14} />
                  </button>
                  {role.name !== "SuperAdmin" && (
                    <button
                      onClick={() => handleDelete(role.id)}
                      className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded Edit Mode */}
              {editing?.id === role.id && (
                <div className="border-t bg-gray-50 px-4 py-3">
                  <div className="flex gap-3 mb-3">
                    <input
                      value={editName} onChange={e => setEditName(e.target.value)}
                      className="flex-1 rounded border px-3 py-1.5 text-sm"
                      placeholder="角色名称"
                    />
                    <input
                      value={editDesc} onChange={e => setEditDesc(e.target.value)}
                      className="flex-1 rounded border px-3 py-1.5 text-sm"
                      placeholder="描述"
                    />
                    <button onClick={handleSave}
                      className="flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700">
                      <Save size={14} /> 保存
                    </button>
                    <button onClick={cancelEdit}
                      className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
                      <X size={14} /> 取消
                    </button>
                  </div>
                  <p className="mb-2 text-xs text-gray-500">点击权限标签来分配/取消：</p>
                  <div className="flex flex-wrap gap-1.5">
                    {allPermissions.map(p => {
                      const assigned = selectedPerms.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => togglePerm(p.id)}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors ${
                            assigned
                              ? "bg-blue-100 text-blue-700 border border-blue-300"
                              : "bg-white text-gray-400 border border-gray-200 hover:border-blue-200"
                          }`}
                        >
                          {PERMISSION_LABELS[p.code] || p.code}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Permissions Tags (collapsed) */}
              {editing?.id !== role.id && (
                <div className="border-t px-4 py-2 flex flex-wrap gap-1">
                  {role.permissions.length === 0 ? (
                    <span className="text-xs text-gray-400">无权限</span>
                  ) : (
                    role.permissions.map(p => (
                      <span key={p.id}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs text-blue-700"
                      >
                        {PERMISSION_LABELS[p.code] || p.code}
                      </span>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
