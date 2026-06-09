"use client";

import { useEffect, useState, useCallback } from "react";

import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { Play, Plus, Trash2, BarChart3, ChevronDown, ChevronRight, AlertCircle, CheckCircle, XCircle } from "lucide-react";

interface Dataset { id: string; name: string; question_count: number; created_at: string | null; }
interface Run {
  id: string; dataset_id: string; dataset_name: string; status: string;
  total_questions: number; avg_recall: number | null; avg_hit_rate: number | null;
  avg_answer_score: number | null; low_confidence_rate: number | null;
  started_at: string | null; completed_at: string | null;
}
interface EvalResultItem {
  id: string; question: string; expected_answer: string; actual_answer: string;
  recall_score: number | null; source_hit_rate: number | null; answer_score: number | null;
  low_confidence: boolean;
}

const SAMPLE_DATASET = [
  {"question": "什么是RAG系统？", "expected_answer": "RAG（检索增强生成）是一种结合信息检索和文本生成的AI架构，通过从外部知识库检索相关文档来增强大语言模型的回答质量。", "expected_sources": []},
  {"question": "RAG系统的主要优势是什么？", "expected_answer": "RAG系统可以基于最新知识回答问题，减少模型幻觉，提供可溯源的答案，并支持动态更新知识库而无需重新训练模型。", "expected_sources": []},
];

function ScoreBadge({ score, label }: { score: number | null; label: string }) {
  if (score == null) return <span className="text-xs text-gray-400">-</span>;
  const pct = (score * 100).toFixed(1);
  const color = score >= 0.8 ? "text-green-600" : score >= 0.6 ? "text-amber-600" : "text-red-500";
  return (
    <span className={`text-xs font-medium ${color}`} title={label}>
      {(score * 100).toFixed(0)}%
    </span>
  );
}

export default function EvaluationsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [name, setName] = useState("");
  const [questions, setQuestions] = useState(JSON.stringify(SAMPLE_DATASET, null, 2));
  const [loading, setLoading] = useState(true);

  // Expanded run → detailed results
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [runDetails, setRunDetails] = useState<Record<string, EvalResultItem[]>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadAll = useCallback(async () => {
    try { setDatasets(await apiGet<Dataset[]>("/api/admin/evaluations/datasets")); } catch {}
    try { setRuns(await apiGet<Run[]>("/api/admin/evaluations/runs")); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Auto-poll when any run is in progress
  const hasRunning = runs.some(r => r.status === "running" || r.status === "pending");
  useEffect(() => {
    if (!hasRunning) return;
    const timer = setInterval(loadAll, 3000);
    return () => clearInterval(timer);
  }, [hasRunning, loadAll]);

  // Auto-refresh expanded run detail when running
  useEffect(() => {
    if (!expandedRunId) return;
    const run = runs.find(r => r.id === expandedRunId);
    if (!run || run.status !== "running") return;
    const timer = setInterval(() => loadRunDetail(expandedRunId), 3000);
    return () => clearInterval(timer);
  }, [expandedRunId, runs]);

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

  const handleDeleteDataset = async (id: string) => {
    if (!confirm("确定删除此评测集？")) return;
    await apiDelete(`/api/admin/evaluations/datasets/${id}`);
    loadAll();
  };

  const handleDeleteRun = async (id: string) => {
    if (!confirm("确定删除此评测记录？")) return;
    await apiDelete(`/api/admin/evaluations/runs/${id}`);
    setExpandedRunId(null);
    loadAll();
  };

  const loadRunDetail = async (runId: string) => {
    if (runDetails[runId]) return;
    setLoadingDetail(true);
    try {
      const data = await apiGet<{ results: EvalResultItem[] }>(`/api/admin/evaluations/runs/${runId}`);
      setRunDetails(prev => ({ ...prev, [runId]: data.results || [] }));
    } catch {}
    setLoadingDetail(false);
  };

  const toggleRun = (runId: string) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
    } else {
      setExpandedRunId(runId);
      loadRunDetail(runId);
    }
  };

  if (loading) return <div className="p-8">加载中...</div>;

  return (
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
          <p className="mt-1 text-xs text-gray-400">
            JSON 格式: [{"{question, expected_answer, expected_sources}"}]
            · expected_sources 填写期望被检索到的文档名列表
          </p>
        </div>

        {/* Datasets */}
        <h3 className="mb-3 text-sm font-medium">评测集</h3>
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
                <button onClick={() => handleDeleteDataset(d.id)} className="rounded p-1 text-gray-400 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {datasets.length === 0 && <p className="py-4 text-center text-sm text-gray-400">暂无评测集，请创建</p>}
        </div>

        {/* Run History */}
        <h3 className="mb-3 text-sm font-medium">评测记录</h3>
        <div className="space-y-2">
          {runs.map(r => {
            const isExpanded = expandedRunId === r.id;
            const details = runDetails[r.id];
            return (
              <div key={r.id} className="rounded-lg border bg-white">
                <button
                  onClick={() => toggleRun(r.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                >
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    r.status === "completed" ? "bg-green-500" :
                    r.status === "running" || r.status === "pending" ? "bg-blue-500 animate-pulse" :
                    r.status === "failed" ? "bg-red-500" : "bg-gray-300"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{r.dataset_name || "评测集"}</span>
                      <span className="text-xs text-gray-400">{r.total_questions} 题</span>
                    </div>
                    <div className="text-xs text-gray-400">
                      {r.status === "completed" ? "已完成" :
                       r.status === "running" ? "运行中..." :
                       r.status === "pending" ? "等待中..." :
                       r.status === "failed" ? "失败" : r.status}
                      {r.completed_at && ` · ${new Date(r.completed_at).toLocaleString("zh-CN")}`}
                    </div>
                  </div>
                  {r.status === "completed" && (
                    <div className="flex gap-3 text-xs shrink-0">
                      <ScoreBadge score={r.avg_answer_score} label="答案分" />
                      <ScoreBadge score={r.avg_recall} label="召回率" />
                      <ScoreBadge score={r.avg_hit_rate} label="命中率" />
                    </div>
                  )}
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t px-4 py-3">
                    {loadingDetail && !details ? (
                      <p className="py-4 text-center text-sm text-gray-400">加载中...</p>
                    ) : r.status === "running" || r.status === "pending" ? (
                      <p className="py-4 text-center text-sm text-gray-400">评测进行中，请稍候...</p>
                    ) : !details || details.length === 0 ? (
                      <p className="py-4 text-center text-sm text-gray-400">暂无结果数据</p>
                    ) : (
                      <div className="space-y-3">
                        {/* Summary bar */}
                        {r.status === "completed" && (
                          <div className="flex items-center gap-4 text-xs text-gray-500 mb-3 pb-3 border-b">
                            <span>答案分: <b className="text-gray-700">{((r.avg_answer_score ?? 0) * 100).toFixed(1)}%</b></span>
                            <span>召回率: <b className="text-gray-700">{((r.avg_recall ?? 0) * 100).toFixed(1)}%</b></span>
                            <span>命中率: <b className="text-gray-700">{((r.avg_hit_rate ?? 0) * 100).toFixed(1)}%</b></span>
                            <span>拒答率: <b className="text-gray-700">{((r.low_confidence_rate ?? 0) * 100).toFixed(1)}%</b></span>
                          </div>
                        )}
                        {/* Per-question results */}
                        {details.map((item, i) => (
                          <div key={item.id} className="rounded border border-gray-100 bg-gray-50/50 p-3">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs font-medium text-gray-500 shrink-0">#{i + 1}</span>
                                <span className="text-sm text-gray-800 font-medium truncate">{item.question}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {item.low_confidence && (
                                  <span className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                                    <AlertCircle size={11} /> 拒答
                                  </span>
                                )}
                                <ScoreBadge score={item.answer_score} label="答案分" />
                                <ScoreBadge score={item.recall_score} label="召回" />
                                <ScoreBadge score={item.source_hit_rate} label="命中" />
                              </div>
                            </div>
                            {/* Expected vs Actual */}
                            <div className="grid grid-cols-2 gap-2 mt-2">
                              <div>
                                <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                                  <CheckCircle size={11} className="text-green-500" /> 期望答案
                                </p>
                                <p className="text-xs text-gray-600 bg-white rounded border px-2 py-1.5 max-h-24 overflow-y-auto">
                                  {item.expected_answer || <span className="text-gray-400">无</span>}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                                  {item.low_confidence
                                    ? <XCircle size={11} className="text-red-400" />
                                    : <CheckCircle size={11} className="text-blue-400" />}
                                  实际回答
                                </p>
                                <p className="text-xs text-gray-600 bg-white rounded border px-2 py-1.5 max-h-24 overflow-y-auto">
                                  {item.actual_answer || <span className="text-gray-400 italic">无（未检索到相关内容）</span>}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Delete run button */}
                    <div className="mt-3 pt-2 border-t flex justify-end">
                      <button
                        onClick={() => handleDeleteRun(r.id)}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50"
                      >
                        <Trash2 size={12} /> 删除此记录
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {runs.length === 0 && <p className="py-8 text-center text-sm text-gray-400">暂无评测记录，创建评测集后点击"运行"开始</p>}
        </div>
      </div>
  );
}
