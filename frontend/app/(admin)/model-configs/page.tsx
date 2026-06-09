"use client";

import { useEffect, useState } from "react";

import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { Plus, Trash2, Save, Star, Cpu } from "lucide-react";

interface ModelConfig {
  id: string; provider: string; model_name: string; api_base: string | null;
  model_type: string; temperature: number; enabled: boolean; is_default: boolean;
  support_streaming: boolean; max_output_tokens: number; created_at: string | null;
}

export default function ModelConfigsPage() {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ModelConfig | null>(null);
  const [form, setForm] = useState({
    provider: "openai-compatible", model_name: "", api_base: "",
    api_key_encrypted: "", model_type: "chat", temperature: 0.1,
    max_output_tokens: 2048, support_streaming: true,
    enabled: true, is_default: false,
  });

  useEffect(() => { loadModels(); }, []);

  const loadModels = async () => {
    setLoading(true);
    try { setModels(await apiGet<ModelConfig[]>("/api/admin/models")); } catch {}
    setLoading(false);
  };

  const handleSave = async () => {
    if (!form.model_name) return;
    if (editing) {
      await apiPatch(`/api/admin/models/${editing.id}`, form);
    } else {
      await apiPost("/api/admin/models", form);
    }
    setEditing(null);
    setForm({ provider: "openai-compatible", model_name: "", api_base: "",
      api_key_encrypted: "", model_type: "chat", temperature: 0.1,
      max_output_tokens: 2048, support_streaming: true, enabled: true, is_default: false });
    loadModels();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除？")) return;
    await apiDelete(`/api/admin/models/${id}`);
    loadModels();
  };

  const startEdit = (m: ModelConfig) => {
    setEditing(m);
    setForm({ provider: m.provider, model_name: m.model_name, api_base: m.api_base || "",
      api_key_encrypted: "", model_type: m.model_type, temperature: m.temperature,
      max_output_tokens: m.max_output_tokens, support_streaming: m.support_streaming,
      enabled: m.enabled, is_default: m.is_default });
  };

  if (loading) return <div className="p-8">加载中...</div>;

  return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-800">模型配置</h2>
          <button onClick={() => { setEditing(null); setForm({ ...form, model_name: "", api_key_encrypted: "" }); }}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
            <Plus size={16} /> 新增模型
          </button>
        </div>

        {/* Form */}
        {(!editing || editing) && form.model_name !== undefined && (
          <div className="mb-6 rounded-lg border bg-white p-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div>
                <label className="text-xs text-gray-500">Provider</label>
                <input value={form.provider} onChange={e => setForm({...form, provider: e.target.value})}
                  className="w-full rounded border px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500">模型名称 *</label>
                <input value={form.model_name} onChange={e => setForm({...form, model_name: e.target.value})}
                  className="w-full rounded border px-2 py-1.5 text-sm" placeholder="gpt-4o" />
              </div>
              <div>
                <label className="text-xs text-gray-500">API Base</label>
                <input value={form.api_base} onChange={e => setForm({...form, api_base: e.target.value})}
                  className="w-full rounded border px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500">API Key</label>
                <input value={form.api_key_encrypted} onChange={e => setForm({...form, api_key_encrypted: e.target.value})}
                  type="password" className="w-full rounded border px-2 py-1.5 text-sm" />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={form.enabled} onChange={e => setForm({...form, enabled: e.target.checked})} /> 启用
              </label>
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={form.is_default} onChange={e => setForm({...form, is_default: e.target.checked})} /> 默认
              </label>
              <button onClick={handleSave}
                className="flex items-center gap-1 rounded-md bg-green-600 px-4 py-1.5 text-sm text-white hover:bg-green-700">
                <Save size={14} /> {editing ? "更新" : "创建"}
              </button>
              {editing && <button onClick={() => setEditing(null)} className="text-sm text-gray-500">取消</button>}
            </div>
          </div>
        )}

        {/* List */}
        <div className="space-y-2">
          {models.map(m => (
            <div key={m.id}
              className="flex items-center justify-between rounded-lg border bg-white px-4 py-3">
              <div className="flex items-center gap-3">
                <Cpu size={18} className="text-blue-500" />
                <div>
                  <span className="font-medium text-sm">{m.model_name}</span>
                  <span className="ml-2 text-xs text-gray-400">{m.provider} · {m.model_type}</span>
                  {m.is_default && <Star size={12} className="ml-1 inline text-yellow-500" />}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded ${m.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                  {m.enabled ? "启用" : "禁用"}
                </span>
                <button onClick={() => startEdit(m)} className="rounded p-1 text-gray-400 hover:text-blue-500">
                  <Save size={14} />
                </button>
                <button onClick={() => handleDelete(m.id)} className="rounded p-1 text-gray-400 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {models.length === 0 && <p className="py-8 text-center text-gray-400">暂无模型配置，当前使用 .env 配置</p>}
        </div>
      </div>
  );
}
