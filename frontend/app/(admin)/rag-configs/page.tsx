"use client";

import { useEffect, useState } from "react";

import { apiGet, apiPatch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Save, Sliders } from "lucide-react";

interface KB { id: string; name: string; type: string; }
interface RAGConfig {
  chunk_size: number; chunk_overlap: number; parent_chunk_size: number;
  top_k_vector: number; top_k_bm25: number; rrf_k: number;
  rerank_top_n: number; score_threshold: number;
  enable_rerank: boolean;
  enable_parent_child_chunking: boolean;
}

const defaults: RAGConfig = {
  chunk_size: 700, chunk_overlap: 100, parent_chunk_size: 2000,
  top_k_vector: 7, top_k_bm25: 7, rrf_k: 60,
  rerank_top_n: 8, score_threshold: 0.1,
  enable_rerank: true,
  enable_parent_child_chunking: true,
};

export default function RagConfigsPage() {
  const [kbs, setKbs] = useState<KB[]>([]);
  const [selectedKb, setSelectedKb] = useState<string>("");
  const [config, setConfig] = useState<RAGConfig>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { loadKBs(); }, []);

  const loadKBs = async () => {
    try { setKbs(await apiGet<KB[]>("/api/knowledge-bases")); } catch {}
    setLoading(false);
  };

  const loadConfig = async (kbId: string) => {
    setSelectedKb(kbId);
    setSaved(false);
    if (!kbId) { setConfig(defaults); return; }
    try { setConfig(await apiGet<RAGConfig>(`/api/knowledge-bases/${kbId}/rag-config`)); } catch { setConfig(defaults); }
  };

  const handleSave = async () => {
    if (!selectedKb) return;
    setSaving(true);
    try {
      await apiPatch(`/api/knowledge-bases/${selectedKb}/rag-config`, config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  };

  const updateConfig = (partial: Partial<RAGConfig>) => {
    setConfig(prev => ({ ...prev, ...partial }));
    setSaved(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const enterpriseKbs = kbs.filter(k => k.type === "enterprise");

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">RAG 参数配置</h2>
      </div>

      <div className="mb-6">
        <label className="block mb-1.5 text-sm font-medium text-[var(--color-text-primary)]">选择知识库</label>
        <select
          value={selectedKb}
          onChange={e => loadConfig(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
        >
          <option value="">-- 选择知识库 --</option>
          {enterpriseKbs.map(k => (
            <option key={k.id} value={k.id}>{k.name}</option>
          ))}
        </select>
      </div>

      {selectedKb ? (
        <Card>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Input
              label="Chunk Size"
              type="number"
              value={config.chunk_size}
              onChange={e => updateConfig({ chunk_size: parseInt(e.target.value) || 0 })}
            />
            <Input
              label="Overlap"
              type="number"
              value={config.chunk_overlap}
              onChange={e => updateConfig({ chunk_overlap: parseInt(e.target.value) || 0 })}
            />
            <Input
              label="Parent Size"
              type="number"
              value={config.parent_chunk_size}
              onChange={e => updateConfig({ parent_chunk_size: parseInt(e.target.value) || 0 })}
            />
            <Input
              label="Top-K Vector"
              type="number"
              value={config.top_k_vector}
              onChange={e => updateConfig({ top_k_vector: parseInt(e.target.value) || 0 })}
            />
            <Input
              label="Top-K BM25"
              type="number"
              value={config.top_k_bm25}
              onChange={e => updateConfig({ top_k_bm25: parseInt(e.target.value) || 0 })}
            />
            <Input
              label="RRF K"
              type="number"
              value={config.rrf_k}
              onChange={e => updateConfig({ rrf_k: parseInt(e.target.value) || 0 })}
            />
            <Input
              label="Rerank Top-N"
              type="number"
              value={config.rerank_top_n}
              onChange={e => updateConfig({ rerank_top_n: parseInt(e.target.value) || 0 })}
            />
            <Input
              label="Score 阈值"
              type="number"
              step={0.05}
              value={config.score_threshold}
              onChange={e => updateConfig({ score_threshold: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-6">
            <label className="flex items-center gap-1.5 text-sm text-[var(--color-text-primary)]">
              <input
                type="checkbox"
                checked={config.enable_rerank}
                onChange={e => updateConfig({ enable_rerank: e.target.checked })}
                className="rounded"
              /> 启用 Rerank
            </label>
            <label className="flex items-center gap-1.5 text-sm text-[var(--color-text-primary)]">
              <input
                type="checkbox"
                checked={config.enable_parent_child_chunking}
                onChange={e => updateConfig({ enable_parent_child_chunking: e.target.checked })}
                className="rounded"
              /> 启用 Parent-Child Chunking
            </label>
          </div>
          <div className="mt-6">
            <Button
              variant={saved ? "primary" : "primary"}
              onClick={handleSave}
              loading={saving}
              className={saved ? "!bg-emerald-600 hover:!bg-emerald-700" : ""}
            >
              <Save size={14} /> {saved ? "已保存" : "保存配置"}
            </Button>
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={Sliders}
          title="请选择知识库"
          description="选择一个知识库以配置其 RAG 参数"
        />
      )}
    </div>
  );
}
