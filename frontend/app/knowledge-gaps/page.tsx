"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/layout/admin-layout";
import { apiGet, apiPost } from "@/lib/api";
import { AlertCircle, CheckCircle } from "lucide-react";

interface Gap { id: string; question: string; status: string; note: string | null; created_at: string | null; }

export default function KnowledgeGapsPage() {
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [loading, setLoading] = useState(true);

  const loadGaps = async () => {
    setLoading(true);
    try { setGaps(await apiGet<Gap[]>("/api/knowledge-gaps")); } catch {}
    setLoading(false);
  };

  useEffect(() => { loadGaps(); }, []);

  const resolve = async (id: string) => {
    await apiPost(`/api/knowledge-gaps/${id}/resolve`);
    loadGaps();
  };

  if (loading) return <AdminLayout><div className="p-8">加载中...</div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h2 className="mb-6 text-xl font-semibold text-gray-800">知识缺口管理</h2>
        <div className="space-y-3">
          {gaps.map(g => (
            <div key={g.id} className="rounded-lg border bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle size={16} className="text-orange-500 shrink-0" />
                    <span className="font-medium text-sm truncate">{g.question}</span>
                  </div>
                  {g.note && <p className="text-xs text-gray-400 mt-1">{g.note}</p>}
                  <p className="text-xs text-gray-400 mt-1">
                    {g.created_at ? new Date(g.created_at).toLocaleString("zh-CN") : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    g.status === "open" ? "bg-orange-100 text-orange-700" :
                    g.status === "processing" ? "bg-blue-100 text-blue-700" :
                    "bg-green-100 text-green-700"
                  }`}>{g.status}</span>
                  {g.status !== "resolved" && (
                    <button onClick={() => resolve(g.id)}
                      className="flex items-center gap-1 rounded-md bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700">
                      <CheckCircle size={12} /> 已解决
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {gaps.length === 0 && <p className="py-8 text-center text-gray-400">暂无知识缺口</p>}
        </div>
      </div>
    </AdminLayout>
  );
}
