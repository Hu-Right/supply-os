"use client";
/**
 * AI 模型配置页
 * @module app/(public)/settings/ai-model/page-client
 * @description 表单配置 OpenAI 兼容 LLM（Base URL / API Key / Model）。
 *              保存调用 PUT /api/user/llm-config。apiKey 不做本地持久化。
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/shared/ui";
import { api } from "@/core/http";
import { fetchLlmConfig, type LlmConfigData } from "@/features/procurement/api/ai-summary";

export default function AiModelSettingsClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [existing, setExisting] = useState<LlmConfigData | null>(null);
  const [form, setForm] = useState({
    providerName: "Custom",
    baseUrl: "",
    apiKey: "",
    model: "",
  });

  useEffect(() => {
    fetchLlmConfig()
      .then((res) => {
        const d = res.data;
        setExisting(d);
        if (d?.configured) {
          setForm((f) => ({
            ...f,
            providerName: d.providerName || "Custom",
            baseUrl: d.baseUrl || "",
            model: d.model || "",
          }));
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!form.baseUrl.trim() || !form.model.trim()) {
      setMessage("Base URL 与模型名称不能为空");
      return;
    }
    if (!form.apiKey.trim()) {
      setMessage("请填写 API Key");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await api("/api/user/llm-config", {
        method: "PUT",
        body: {
          providerName: form.providerName.trim() || "Custom",
          baseUrl: form.baseUrl.trim(),
          apiKey: form.apiKey.trim(),
          model: form.model.trim(),
        },
      });
      setMessage("保存成功");
      setForm((f) => ({ ...f, apiKey: "" }));
      const res = await fetchLlmConfig();
      setExisting(res.data);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-16 text-center text-sm text-slate-400">加载中…</div>;
  }

  const field = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-400 focus:outline-none";

  return (
    <Card className="rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-base font-extrabold text-slate-900">AI 模型配置</h2>
        <p className="text-xs text-slate-500 mt-1">
          配置任意 OpenAI 兼容接口（DeepSeek / OpenAI / 其他），用于生成个性化 AI 拆标摘要。API Key 加密存储，不会明文回显。
        </p>
      </div>

      {existing?.configured && (
        <div className="rounded-lg bg-teal-50 border border-teal-200 px-3 py-2 text-xs text-teal-700">
          当前已配置：{existing.providerName} · {existing.model} · Key {existing.apiKeyMasked}
        </div>
      )}

      <div>
        <label className="block text-xs font-bold text-slate-600 mb-1">提供商名称</label>
        <input className={field} value={form.providerName} maxLength={100}
          onChange={(e) => setForm({ ...form, providerName: e.target.value })} placeholder="如 DeepSeek" />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-600 mb-1">Base URL</label>
        <input className={field} value={form.baseUrl}
          onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.deepseek.com" />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-600 mb-1">API Key</label>
        <input className={field} type="password" value={form.apiKey}
          onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
          placeholder={existing?.configured ? "重新填写以更新 Key" : "sk-..."} />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-600 mb-1">模型名称</label>
        <input className={field} value={form.model}
          onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="deepseek-chat / gpt-4o-mini" />
      </div>

      {message && (
        <p className={`text-xs font-bold ${message === "保存成功" ? "text-teal-700" : "text-rose-600"}`}>
          {message}
        </p>
      )}

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={saving} variant="primary">
          {saving ? "保存中…" : "保存配置"}
        </Button>
        <Button onClick={() => router.back()} variant="outline">返回</Button>
      </div>
    </Card>
  );
}
