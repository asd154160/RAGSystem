"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/layout/admin-layout";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { Play, Plus, Trash2, BarChart3, Loader2 } from "lucide-react";

interface Dataset { id: string; name: string; question_count: number; created_at: string | null; }
interface Run { id: string; status: string; total_questions: number; avg_recall: number | null; avg_hit_rate: number | null; avg_answer_score: number | null; low_confidence_rate: number | null; }

const SAMPLE_DATASET = [
  {"question":"What is FBA?","expected_answer":"FBA stands for Fulfillment by Amazon","expected_sources":[]},
  {"question":"What are FBA fees?","expected_answer":"FBA fees include storage and fulfillment fees","expected_sources":[]},
];

export default function EvaluationsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [name, setName] = useState("");
  const [questions, setQuestions] = useState(JSON.stringify(SAMPLE_DATASET, null, 2));
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try { setDatasets(await apiGet<Dataset[]>("/api/admin/evaluations/datasets")); } catch {}
    try { setRuns(await apiGet<Run[]>("/api/admin/evaluations/runs")); } catch {}
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!name) return;
    try {
      await apiPost("/api/admin/evaluations/datasets", { name, questions: JSON.parse(questions) });
      setName(""); loadAll();
    } catch (e: any) { alert("JSON 格式错误: " + e.message); }
  };

  const handleRun = async (datasetId: string) => {
    await apiPost("/api/admin/evaluations/runs", { dataset_id: datasetId, kb_ids: [] });
    loadAll();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除？")) return;
    await apiDelete(`/api/admin/evaluations/datasets/${id}`);
    loadAll();
  };

  if (loading) return <AdminLayout><div className="p-8">加载中...</div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h2 className="mb-6 text-xl font-semibold text-gray-800">RAG 评测</h2>

        {/* Create Dataset */}
        <div className="mb-8 rounded-lg border bg-white p-4">
          <h3 className="mb-3 text-sm font-medium">创建评测集</h3>
          <div className="flex gap-3 mb-3">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="评测集名称"
              className="flex-1 rounded border px-3 py-2 text-sm" />
            <button onClick={handleCreate}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
              <Plus size={14} /> 创建
            </button>
          </div>
          <textarea value={questions} onChange={e => setQuestions(e.target.value)}
            rows={6} className="w-full rounded border px-3 py-2 text-xs font-mono" />
          <p className="mt-1 text-xs text-gray-400">JSON 格式: [{"{question, expected_answer, expected_sources}"}]</p>
        </div>

        {/* Datasets */}
        <h3 className="mb-3 text-sm font-medium">评测集列表</h3>
        <div className="mb-8 space-y-2">
          {datasets.map(d => (
            <div key={d.id} className="flex items-center justify-between rounded-lg border bg-white px-4 py-3">
              <div className="flex items-center gap-3">
                <BarChart3 size={16} className="text-blue-500" />
                <span className="text-sm font-medium">{d.name}</span>
                <span className="text-xs text-gray-400">{d.question_count} 题</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleRun(d.id)}
                  className="flex items-center gap-1 rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700">
                  <Play size={12} /> 运行
                </button>
                <button onClick={() => handleDelete(d.id)} className="rounded p-1 text-gray-400 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {datasets.length === 0 && <p className="py-4 text-center text-sm text-gray-400">暂无评测集</p>}
        </div>

        {/* Run Results */}
        <h3 className="mb-3 text-sm font-medium">评测记录</h3>
        <div className="space-y-2">
          {runs.map(r => (
            <div key={r.id} className="rounded-lg border bg-white px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${r.status === "completed" ? "bg-green-500" : r.status === "running" ? "bg-blue-500 animate-pulse" : "bg-gray-300"}`} />
                  <span className="text-sm">{r.status === "completed" ? "已完成" : r.status === "running" ? "运行中..." : r.status}</span>
                  <span className="text-xs text-gray-400">{r.total_questions} 题</span>
                </div>
                {r.status === "completed" && (
                  <div className="flex gap-4 text-xs text-gray-600">
                    <span>召回率: {(r.avg_recall ?? 0 * 100).toFixed(1)}%</span>
                    <span>命中率: {(r.avg_hit_rate ?? 0 * 100).toFixed(1)}%</span>
                    <span>答案分: {r.avg_answer_score?.toFixed(2) ?? "-"}</span>
                    <span>拒答率: {(r.low_confidence_rate ?? 0 * 100).toFixed(1)}%</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
