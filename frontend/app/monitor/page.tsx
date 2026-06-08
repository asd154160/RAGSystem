"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/layout/admin-layout";
import { apiGet, apiPost } from "@/lib/api";
import { Activity, Clock, AlertTriangle, Zap, RotateCw } from "lucide-react";

const NODE_LABELS: Record<string, string> = {
  rag_retrieve_ms: "混合检索",
  rag_rerank_ms: "重排序",
  rag_check_confidence_ms: "置信度检测",
  rag_expand_ms: "上下文扩展",
  rag_total_ms: "总耗时",
};

interface Metrics {
  uptime_hours: number;
  counters: Record<string, number>;
  averages: Record<string, number>;
  recent_timings: Record<string, number[]>;
}

export default function MonitorPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMetrics = async () => {
    try { setMetrics(await apiGet<Metrics>("/api/admin/monitor")); } catch {}
    setLoading(false);
  };

  useEffect(() => { loadMetrics(); const t = setInterval(loadMetrics, 5000); return () => clearInterval(t); }, []);

  if (loading) return <AdminLayout><div className="p-8">加载中...</div></AdminLayout>;
  if (!metrics) return <AdminLayout><div className="p-8">无法加载监控数据</div></AdminLayout>;

  const c = metrics.counters;
  const a = metrics.averages;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-800">系统监控</h2>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-400">运行: {metrics.uptime_hours}h</span>
            <button onClick={loadMetrics}
              className="flex items-center gap-1 rounded-md border px-3 py-1 text-xs text-gray-600 hover:bg-gray-50">
              <RotateCw size={12} /> 刷新
            </button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-8">
          <Card icon={<Zap size={20} />} label="今日调用" value={c.rag_query_total || 0} color="blue" />
          <Card icon={<Clock size={20} />} label="平均延迟" value={`${a.rag_total_ms_avg_ms?.toFixed(0) || "-"} ms`} color="green" />
          <Card icon={<AlertTriangle size={20} />} label="低置信度" value={c.rag_query_low_confidence || 0} color="orange" />
          <Card icon={<Activity size={20} />} label="错误数" value={c.rag_query_error || 0} color="red" />
        </div>

        {/* Timing Details */}
        <div className="rounded-lg border bg-white p-6">
          <h3 className="mb-4 text-sm font-medium text-gray-700">耗时指标</h3>
          <div className="space-y-3">
            {Object.entries(a).filter(([k]) => k.endsWith("_avg_ms")).map(([key, val]) => {
              const label = NODE_LABELS[key.replace("_avg_ms", "")] || key.replace("_avg_ms", "").replace(/_/g, " ");
              const p95Key = key.replace("_avg_ms", "_p95_ms");
              const p95 = a[p95Key];
              return (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{label}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium">{val} ms</span>
                    {p95 !== undefined && <span className="text-xs text-gray-400">p95: {p95} ms</span>}
                    <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(Number(val) / 50, 100)}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
            {Object.keys(a).filter(k => k.endsWith("_avg_ms")).length === 0 && (
              <p className="text-sm text-gray-400">暂无数据（触发几次 RAG 问答后可见）</p>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function Card({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = { blue: "bg-blue-50 text-blue-600", green: "bg-green-50 text-green-600", orange: "bg-orange-50 text-orange-600", red: "bg-red-50 text-red-600" };
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${colors[color]}`}>{icon}</div>
      </div>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
