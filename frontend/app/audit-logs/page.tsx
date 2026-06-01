"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/layout/admin-layout";
import { apiGet } from "@/lib/api";
import { ScrollText } from "lucide-react";

interface AuditLog { id: string; username: string; action: string; detail: string | null; created_at: string | null; }

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<AuditLog[]>("/api/admin/audit-logs?limit=100")
      .then(setLogs).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <AdminLayout><div className="p-8">加载中...</div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h2 className="mb-6 text-xl font-semibold text-gray-800">审计日志</h2>
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-gray-600">时间</th>
                <th className="px-4 py-3 text-left text-gray-600">用户</th>
                <th className="px-4 py-3 text-left text-gray-600">操作</th>
                <th className="px-4 py-3 text-left text-gray-600">详情</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                    {l.created_at ? new Date(l.created_at).toLocaleString("zh-CN") : "-"}
                  </td>
                  <td className="px-4 py-2.5">{l.username || "-"}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{l.action}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 max-w-xs truncate">{l.detail || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs.length === 0 && <p className="py-8 text-center text-gray-400">暂无审计记录</p>}
        </div>
      </div>
    </AdminLayout>
  );
}
