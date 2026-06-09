"use client";

import { useEffect, useState } from "react";

import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Save, Star, Cpu } from "lucide-react";

interface ModelConfig {
  id: string; provider: string; model_name: string; api_base: string | null;
  model_type: string; temperature: number; enabled: boolean; is_default: boolean;
  support_streaming: boolean; max_output_tokens: number; created_at: string | null;
}

const PROVIDERS = [
  "openai-compatible",
  "openai",
  "deepseek",
  "minimax",
  "qwen",
];

const MODEL_TYPES = ["chat", "embedding", "rerank"];

export default function ModelConfigsPage() {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    provider: "openai-compatible", model_name: "", api_base: "",
    api_key_encrypted: "", model_type: "chat", temperature: 0.1,
    max_output_tokens: 2048, support_streaming: true,
    enabled: true, is_default: false,
  });
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => { loadModels(); }, []);

  const loadModels = async () => {
    setLoading(true);
    try { setModels(await apiGet<ModelConfig[]>("/api/admin/models")); } catch {}
    setLoading(false);
  };

  const resetForm = () => {
    setForm({
      provider: "openai-compatible", model_name: "", api_base: "",
      api_key_encrypted: "", model_type: "chat", temperature: 0.1,
      max_output_tokens: 2048, support_streaming: true, enabled: true, is_default: false,
    });
    setEditingId(null);
    setShowAddForm(false);
  };

  const handleSave = async () => {
    if (!form.model_name.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await apiPatch(`/api/admin/models/${editingId}`, form);
      } else {
        await apiPost("/api/admin/models", form);
      }
      resetForm();
      loadModels();
    } catch {}
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除？")) return;
    await apiDelete(`/api/admin/models/${id}`);
    loadModels();
  };

  const startEdit = (m: ModelConfig) => {
    setEditingId(m.id);
    setShowAddForm(false);
    setForm({
      provider: m.provider, model_name: m.model_name, api_base: m.api_base || "",
      api_key_encrypted: "", model_type: m.model_type, temperature: m.temperature,
      max_output_tokens: m.max_output_tokens, support_streaming: m.support_streaming,
      enabled: m.enabled, is_default: m.is_default,
    });
  };

  const startAdd = () => {
    resetForm();
    setShowAddForm(true);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <p className="text-sm text-[var(--color-text-secondary)]">加载中...</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">模型配置</h2>
        <Button variant="primary" onClick={startAdd}>
          <Plus size={16} /> 新增模型
        </Button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <Card className="mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block mb-1.5 text-sm font-medium text-[var(--color-text-primary)]">提供商</label>
              <select
                value={form.provider}
                onChange={e => setForm({ ...form, provider: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
              >
                {PROVIDERS.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <Input
              label="模型名称 *"
              value={form.model_name}
              onChange={e => setForm({ ...form, model_name: e.target.value })}
              placeholder="gpt-4o"
            />
            <Input
              label="API Base"
              value={form.api_base}
              onChange={e => setForm({ ...form, api_base: e.target.value })}
              placeholder="https://api.example.com/v1"
            />
            <Input
              label="API Key"
              type="password"
              value={form.api_key_encrypted}
              onChange={e => setForm({ ...form, api_key_encrypted: e.target.value })}
              placeholder="sk-..."
            />
            <div>
              <label className="block mb-1.5 text-sm font-medium text-[var(--color-text-primary)]">模型类型</label>
              <select
                value={form.model_type}
                onChange={e => setForm({ ...form, model_type: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
              >
                {MODEL_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <Input
              label="Temperature"
              type="number"
              step={0.1}
              min={0}
              max={2}
              value={form.temperature}
              onChange={e => setForm({ ...form, temperature: parseFloat(e.target.value) || 0 })}
            />
            <Input
              label="Max Tokens"
              type="number"
              value={form.max_output_tokens}
              onChange={e => setForm({ ...form, max_output_tokens: parseInt(e.target.value) || 0 })}
            />
            <div className="flex items-end gap-4 pb-1">
              <label className="flex items-center gap-1.5 text-sm text-[var(--color-text-primary)]">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={e => setForm({ ...form, enabled: e.target.checked })}
                  className="rounded"
                /> 启用
              </label>
              <label className="flex items-center gap-1.5 text-sm text-[var(--color-text-primary)]">
                <input
                  type="checkbox"
                  checked={form.is_default}
                  onChange={e => setForm({ ...form, is_default: e.target.checked })}
                  className="rounded"
                /> 默认
              </label>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button variant="primary" onClick={handleSave} loading={saving}>
              <Save size={14} /> 创建
            </Button>
            <Button variant="secondary" onClick={resetForm}>取消</Button>
          </div>
        </Card>
      )}

      {/* Model List */}
      <div className="space-y-2">
        {models.map(m => {
          const isEditing = editingId === m.id;

          if (isEditing) {
            return (
              <Card key={m.id} className="mb-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block mb-1.5 text-sm font-medium text-[var(--color-text-primary)]">提供商</label>
                    <select
                      value={form.provider}
                      onChange={e => setForm({ ...form, provider: e.target.value })}
                      className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
                    >
                      {PROVIDERS.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <Input
                    label="模型名称 *"
                    value={form.model_name}
                    onChange={e => setForm({ ...form, model_name: e.target.value })}
                    placeholder="gpt-4o"
                  />
                  <Input
                    label="API Base"
                    value={form.api_base}
                    onChange={e => setForm({ ...form, api_base: e.target.value })}
                  />
                  <Input
                    label="API Key"
                    type="password"
                    value={form.api_key_encrypted}
                    onChange={e => setForm({ ...form, api_key_encrypted: e.target.value })}
                    placeholder="留空不修改"
                  />
                  <div>
                    <label className="block mb-1.5 text-sm font-medium text-[var(--color-text-primary)]">模型类型</label>
                    <select
                      value={form.model_type}
                      onChange={e => setForm({ ...form, model_type: e.target.value })}
                      className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
                    >
                      {MODEL_TYPES.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <Input
                    label="Temperature"
                    type="number"
                    step={0.1}
                    min={0}
                    max={2}
                    value={form.temperature}
                    onChange={e => setForm({ ...form, temperature: parseFloat(e.target.value) || 0 })}
                  />
                  <Input
                    label="Max Tokens"
                    type="number"
                    value={form.max_output_tokens}
                    onChange={e => setForm({ ...form, max_output_tokens: parseInt(e.target.value) || 0 })}
                  />
                  <div className="flex items-end gap-4 pb-1">
                    <label className="flex items-center gap-1.5 text-sm text-[var(--color-text-primary)]">
                      <input
                        type="checkbox"
                        checked={form.enabled}
                        onChange={e => setForm({ ...form, enabled: e.target.checked })}
                        className="rounded"
                      /> 启用
                    </label>
                    <label className="flex items-center gap-1.5 text-sm text-[var(--color-text-primary)]">
                      <input
                        type="checkbox"
                        checked={form.is_default}
                        onChange={e => setForm({ ...form, is_default: e.target.checked })}
                        className="rounded"
                      /> 默认
                    </label>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <Button variant="primary" onClick={handleSave} loading={saving}>
                    <Save size={14} /> 更新
                  </Button>
                  <Button variant="secondary" onClick={resetForm}>取消</Button>
                </div>
              </Card>
            );
          }

          return (
            <Card key={m.id} className="!p-0 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <Cpu size={18} className="text-[var(--color-accent)]" />
                  <div>
                    <span className="font-medium text-sm text-[var(--color-text-primary)]">{m.model_name}</span>
                    <span className="ml-2 text-xs text-[var(--color-text-secondary)]">{m.provider} · {m.model_type}</span>
                    {m.is_default && <Star size={12} className="ml-1 inline text-amber-500" fill="currentColor" />}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={m.enabled ? "success" : "default"}>
                    {m.enabled ? "已启用" : "已禁用"}
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={() => startEdit(m)}>
                    编辑
                  </Button>
                  <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handleDelete(m.id)}>
                    删除
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
        {models.length === 0 && !showAddForm && (
          <p className="py-8 text-center text-sm text-[var(--color-text-secondary)]">暂无模型配置，当前使用 .env 配置</p>
        )}
      </div>
    </div>
  );
}
