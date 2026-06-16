"use client";

import { useEffect, useState, useCallback } from "react";

import { apiGet } from "@/lib/api";
import { ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";

interface AuditLog { id: string; username: string; action: string; detail: string | null; created_at: string | null; }

const PAGE_SIZE = 15;

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const loadLogs = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const offset = (p - 1) * PAGE_SIZE;
      const data = await apiGet<{ items: AuditLog[]; total: number }>(`/api/admin/audit-logs?limit=${PAGE_SIZE}&offset=${offset}`);
      setLogs(data.items);
      setTotal(data.total);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadLogs(page); }, [page, loadLogs]);

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-[var(--color-background)]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[var(--color-accent)]/20 border-t-[var(--color-accent)] rounded-full animate-spin" />
        <p className="text-sm text-[var(--color-text-secondary)]">加载中...</p>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-6">审计日志</h2>

      {logs.length === 0 ? (
        <EmptyState icon={ScrollText} title="暂无审计记录" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">时间</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">用户</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">操作</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">详情</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id} className="border-b border-[var(--color-border)] hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-[var(--color-text-secondary)] whitespace-nowrap">
                      {l.created_at ? new Date(l.created_at).toLocaleString("zh-CN") : "-"}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-text-primary)]">{l.username || "-"}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant="default">{l.action}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-text-secondary)] max-w-xs truncate">{l.detail || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
        </>
      )}
    </div>
  );
}
