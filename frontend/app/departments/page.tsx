"use client";

import { useEffect, useState, useCallback } from "react";
import AdminLayout from "@/components/layout/admin-layout";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { Plus, Trash2, X } from "lucide-react";

interface Department {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  is_active: boolean;
  created_at: string;
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [error, setError] = useState("");

  const fetchDepts = useCallback(async () => {
    try {
      const data = await apiGet<Department[]>("/api/departments");
      setDepartments(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDepts();
  }, [fetchDepts]);

  async function handleCreate() {
    if (!form.name.trim()) {
      setError("请输入部门名称");
      return;
    }
    try {
      await apiPost("/api/departments", form);
      setShowForm(false);
      setForm({ name: "", description: "" });
      setError("");
      fetchDepts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("确定删除该部门？")) return;
    try {
      await apiDelete(`/api/departments/${id}`);
      fetchDepts();
    } catch (err) {
      console.error(err);
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <p className="text-gray-500">加载中...</p>
        </div>
      </AdminLayout>
    );
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
            <Plus size={16} />
            新建部门
          </button>
        </div>

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">新建部门</h3>
                <button onClick={() => setShowForm(false)}>
                  <X size={18} className="text-gray-400 hover:text-gray-600" />
                </button>
              </div>
              <div className="space-y-3">
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="部门名称"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="描述（可选）"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button
                  onClick={handleCreate}
                  className="w-full rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  创建
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">部门名称</th>
                <th className="px-4 py-3 font-medium">描述</th>
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
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        dept.is_active
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {dept.is_active ? "正常" : "已禁用"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {new Date(dept.created_at).toLocaleDateString("zh-CN")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(dept.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {departments.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                    暂无部门
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
