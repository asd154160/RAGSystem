"use client";

import { useEffect, useState } from "react";

import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Save, Shield, Key, ChevronDown, ChevronRight } from "lucide-react";

interface Permission {
  id: string; code: string; description: string;
}
interface Role {
  id: string; name: string; description: string | null;
  permissions: Permission[];
}

const SYSTEM_ROLES = new Set(["SuperAdmin", "Admin", "Reviewer", "User", "userin"]);

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);

  // New role modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPerms, setNewPerms] = useState<string[]>([]);

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

  const toggleExpand = (role: Role) => {
    if (expandedId === role.id) {
      setExpandedId(null);
    } else {
      setExpandedId(role.id);
      setEditName(role.name);
      setEditDesc(role.description || "");
      setSelectedPerms(role.permissions.map(p => p.id));
    }
  };

  const handleSave = async (roleId: string) => {
    await apiPatch(`/api/roles/${roleId}`, {
      name: editName,
      description: editDesc,
      permission_ids: selectedPerms,
    });
    setExpandedId(null);
    loadData();
  };

  const openNewModal = () => {
    setNewName("");
    setNewDesc("");
    setNewPerms([]);
    setShowNewModal(true);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await apiPost("/api/roles", { name: newName, description: newDesc, permission_ids: newPerms });
    setShowNewModal(false);
    loadData();
  };

  const handleDelete = async (roleId: string) => {
    if (!confirm("确定删除该角色？")) return;
    await apiDelete(`/api/roles/${roleId}`);
    if (expandedId === roleId) setExpandedId(null);
    loadData();
  };

  const togglePerm = (permId: string) => {
    setSelectedPerms(prev =>
      prev.includes(permId) ? prev.filter(id => id !== permId) : [...prev, permId]
    );
  };

  const toggleNewPerm = (permId: string) => {
    setNewPerms(prev =>
      prev.includes(permId) ? prev.filter(id => id !== permId) : [...prev, permId]
    );
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <p className="text-sm text-[var(--color-text-secondary)]">加载中...</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">权限管理</h2>
        <Button variant="primary" onClick={openNewModal}>
          <Plus size={16} /> 新建角色
        </Button>
      </div>

      {/* Permission Legend */}
      <Card className="mb-6 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--color-text-secondary)] mr-2">全部权限：</span>
          {allPermissions.map(p => (
            <Badge key={p.id} variant="default" className="gap-1">
              <Key size={10} /> {PERMISSION_LABELS[p.code] || p.code}
            </Badge>
          ))}
        </div>
      </Card>

      {/* Roles List */}
      <div className="space-y-3">
        {roles.map(role => {
          const isExpanded = expandedId === role.id;
          const isSystem = SYSTEM_ROLES.has(role.name);

          return (
            <Card key={role.id} className="p-0 overflow-hidden">
              {/* Role Header */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <Shield size={18} className="text-[var(--color-accent)]" />
                  <div>
                    <span className="font-medium text-sm text-[var(--color-text-primary)]">{role.name}</span>
                    {role.description && (
                      <span className="ml-2 text-xs text-[var(--color-text-secondary)]">{role.description}</span>
                    )}
                  </div>
                  <Badge variant="default">
                    {isSystem ? "系统" : "自定义"}
                  </Badge>
                  <span className="text-xs text-[var(--color-text-secondary)]">{role.permissions.length} 个权限</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleExpand(role)}
                  >
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSave(role.id)}
                  >
                    <Save size={14} /> 保存
                  </Button>
                  {!isSystem && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500"
                      onClick={() => handleDelete(role.id)}
                    >
                      <Trash2 size={14} /> 删除
                    </Button>
                  )}
                </div>
              </div>

              {/* Expanded Edit Mode */}
              {isExpanded && (
                <div className="border-t border-[var(--color-border)] bg-gray-50 px-4 py-3">
                  <div className="flex gap-3 mb-3">
                    <Input
                      label="角色名称"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="角色名称"
                    />
                    <Input
                      label="描述"
                      value={editDesc}
                      onChange={e => setEditDesc(e.target.value)}
                      placeholder="角色描述"
                    />
                  </div>
                  <p className="mb-2 text-xs text-[var(--color-text-secondary)]">点击权限标签来分配/取消：</p>
                  <div className="flex flex-wrap gap-1.5">
                    {allPermissions.map(p => {
                      const assigned = selectedPerms.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => togglePerm(p.id)}
                          className="cursor-pointer"
                        >
                          <Badge
                            variant="default"
                            className={
                              assigned
                                ? "bg-indigo-100 text-indigo-700 ring-2 ring-indigo-400 font-medium"
                                : "bg-white text-gray-400 border border-gray-200"
                            }
                          >
                            {PERMISSION_LABELS[p.code] || p.code}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Permissions Tags (collapsed) */}
              {!isExpanded && (
                <div className="border-t border-[var(--color-border)] px-4 py-2 flex flex-wrap gap-1">
                  {role.permissions.length === 0 ? (
                    <span className="text-xs text-[var(--color-text-secondary)]">无权限</span>
                  ) : (
                    role.permissions.map(p => (
                      <Badge
                        key={p.id}
                        variant="default"
                        className="bg-[var(--color-accent-soft)] text-[var(--color-accent)] border border-[var(--color-accent)]/20"
                      >
                        {PERMISSION_LABELS[p.code] || p.code}
                      </Badge>
                    ))
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Create Role Modal */}
      <Modal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        title="新建角色"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowNewModal(false)}>取消</Button>
            <Button variant="primary" onClick={handleCreate}>
              <Plus size={14} /> 创建
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="角色名称"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="输入角色名称"
            autoFocus
          />
          <Textarea
            label="描述"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder="输入角色描述"
            rows={3}
          />
          <div>
            <p className="mb-2 text-xs text-[var(--color-text-secondary)]">选择权限：</p>
            <div className="flex flex-wrap gap-1.5">
              {allPermissions.map(p => {
                const selected = newPerms.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggleNewPerm(p.id)}
                    className="cursor-pointer transition-colors"
                  >
                    <Badge
                      variant="default"
                      className={
                        selected
                          ? "bg-indigo-100 text-indigo-700 ring-2 ring-indigo-400 font-medium"
                          : "bg-white text-gray-400 border border-gray-200"
                      }
                    >
                      {PERMISSION_LABELS[p.code] || p.code}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
