"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/layout/admin-layout";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import { Save, Database } from "lucide-react";

interface KB { id: string; name: string; type: string; }
interface RAGConfig {
  chunk_size: number; chunk_overlap: number; parent_chunk_size: number;
  top_k_vector: number; top_k_bm25: number; rrf_k: number;
  rerank_top_n: number; score_threshold: number;
  enable_query_rewrite: boolean; enable_rerank: boolean;
  enable_parent_child_chunking: boolean;
}

const defaults: RAGConfig = {
  chunk_size: 700, chunk_overlap: 100, parent_chunk_size: 2000,
  top_k_vector: 10, top_k_bm25: 10, rrf_k: 60,
  rerank_top_n: 5, score_threshold: 0.3,
  enable_query_rewrite: true, enable_rerank: true,
  enable_parent_child_chunking: true,
};

export default function RagConfigsPage() {
  const [kbs, setKbs] = useState<KB[]>([]);
  const [selectedKb, setSelectedKb] = useState<string>("");
  const [config, setConfig] = useState<RAGConfig>(defaults);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => { loadKBs(); }, []);

  const loadKBs = async () => {
    try { setKbs(await apiGet<KB[]>("/api/knowledge-bases")); } catch {}
    setLoading(false);
  };

  const loadConfig = async (kbId: string) => {
    setSelectedKb(kbId);
    setSaved(false);
    try { setConfig(await apiGet<RAGConfig>(`/api/knowledge-bases/${kbId}/rag-config`)); } catch { setConfig(defaults); }
  };

  const handleSave = async () => {
    if (!selectedKb) return;
    await apiPatch(`/api/knowledge-bases/${selectedKb}/rag-config`, config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <AdminLayout><div className="p-8">加载中...</div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h2 className="mb-6 text-xl font-semibold text-gray-800">RAG 参数配置</h2>

        <div className="mb-4">
          <label className="text-sm text-gray-600">选择知识库</label>
          <select value={selectedKb} onChange={e => loadConfig(e.target.value)}
            className="ml-3 rounded border px-3 py-2 text-sm">
            <option value="">-- 选择知识库 --</option>
            {kbs.filter(k => k.type === "enterprise").map(k => (
              <option key={k.id} value={k.id}>{k.name}</option>
            ))}
          </select>
        </div>

        {selectedKb && (
          <div className="space-y-4 rounded-lg border bg-white p-6">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <NumField label="Chunk Size" value={config.chunk_size} onChange={v => setConfig({...config, chunk_size: v})} />
              <NumField label="Overlap" value={config.chunk_overlap} onChange={v => setConfig({...config, chunk_overlap: v})} />
              <NumField label="Parent Size" value={config.parent_chunk_size} onChange={v => setConfig({...config, parent_chunk_size: v})} />
              <NumField label="Top-K Vector" value={config.top_k_vector} onChange={v => setConfig({...config, top_k_vector: v})} />
              <NumField label="Top-K BM25" value={config.top_k_bm25} onChange={v => setConfig({...config, top_k_bm25: v})} />
              <NumField label="RRF K" value={config.rrf_k} onChange={v => setConfig({...config, rrf_k: v})} />
              <NumField label="Rerank Top-N" value={config.rerank_top_n} onChange={v => setConfig({...config, rerank_top_n: v})} />
              <NumField label="阈值" value={config.score_threshold} step={0.05} onChange={v => setConfig({...config, score_threshold: v})} />
            </div>
            <div className="flex flex-wrap gap-4">
              <BoolField label="Query Rewrite" value={config.enable_query_rewrite} onChange={v => setConfig({...config, enable_query_rewrite: v})} />
              <BoolField label="Rerank" value={config.enable_rerank} onChange={v => setConfig({...config, enable_rerank: v})} />

              <BoolField label="Parent-Child Chunking" value={config.enable_parent_child_chunking} onChange={v => setConfig({...config, enable_parent_child_chunking: v})} />
            </div>
            <button onClick={handleSave}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm text-white ${saved ? "bg-green-500" : "bg-blue-600 hover:bg-blue-700"}`}>
              <Save size={14} /> {saved ? "已保存" : "保存配置"}
            </button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function NumField({ label, value, step = 1, onChange }: { label: string; value: number; step?: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-xs text-gray-500">{label}</label>
      <input type="number" value={value} step={step} onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-full rounded border px-2 py-1.5 text-sm" />
    </div>
  );
}

function BoolField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} /> {label}
    </label>
  );
}
