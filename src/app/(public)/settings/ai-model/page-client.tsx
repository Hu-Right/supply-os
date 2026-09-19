"use client";
/**
 * AI 模型配置页
 * @module app/(public)/settings/ai-model/page-client
 * @description 面向非技术用户：通过下拉选择器切换预置模型（DeepSeek / 通义 / 智谱 / Kimi / OpenAI 等），
 *              自动填充 Base URL 与模型名；用户只需粘贴 API Key。
 *              下拉末尾提供"自定义"选项，展开原有三输入框以支持任意 OpenAI 兼容端点。
 *              保存调用 PUT /api/user/llm-config，apiKey 不做本地持久化。
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/shared/ui";
import { api } from "@/core/http";
import { fetchLlmConfig, type LlmConfigData } from "@/features/procurement/api/ai-summary";
import {
  PRESET_LLM_MODELS,
  CUSTOM_PRESET_ID,
  matchPresetByConfig,
} from "@/lib/services/ai-summary/config";

export default function AiModelSettingsClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [existing, setExisting] = useState<LlmConfigData | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(PRESET_LLM_MODELS[0].id);
  const [form, setForm] = useState({
    providerName: PRESET_LLM_MODELS[0].providerName,
    baseUrl: PRESET_LLM_MODELS[0].baseUrl,
    apiKey: "",
    model: PRESET_LLM_MODELS[0].model,
  });
  /** BYOK 数据出站授权（合规：后端保存时强制校验并写入同意审计日志） */
  const [outboundConsent, setOutboundConsent] = useState(false);

  const isCustom = selectedPresetId === CUSTOM_PRESET_ID;
  const currentPreset = useMemo(
    () => PRESET_LLM_MODELS.find((p) => p.id === selectedPresetId) ?? null,
    [selectedPresetId],
  );

  useEffect(() => {
    fetchLlmConfig()
      .then((res) => {
        const d = res.data;
        setExisting(d);
        if (d?.configured) {
          const baseUrl = d.baseUrl || "";
          const model = d.model || "";
          const matched = matchPresetByConfig(baseUrl, model);
          setForm((f) => ({
            ...f,
            providerName: d.providerName || matched?.providerName || "Custom",
            baseUrl,
            model,
          }));
          setSelectedPresetId(matched ? matched.id : CUSTOM_PRESET_ID);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  /** 下拉切换：预置项自动填充 provider/baseUrl/model；自定义则保留当前值让用户可编辑 */
  const handlePresetChange = (nextId: string) => {
    setSelectedPresetId(nextId);
    if (nextId === CUSTOM_PRESET_ID) {
      setForm((f) => ({ ...f, providerName: f.providerName || "Custom" }));
      return;
    }
    const preset = PRESET_LLM_MODELS.find((p) => p.id === nextId);
    if (!preset) return;
    setForm((f) => ({
      ...f,
      providerName: preset.providerName,
      baseUrl: preset.baseUrl,
      model: preset.model,
    }));
  };

  const handleSave = async () => {
    if (!form.baseUrl.trim() || !form.model.trim()) {
      setMessage("Base URL 与模型名称不能为空");
      return;
    }
    if (!form.apiKey.trim()) {
      setMessage("请填写 API Key");
      return;
    }
    if (!outboundConsent) {
      setMessage("请先勾选数据出站授权");
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
          outboundConsent: true,
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

  const field =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-400 focus:outline-none";

  return (
    <Card className="rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-base font-extrabold text-slate-900">AI 模型配置</h2>
        <p className="text-xs text-slate-500 mt-1">
          从下方推荐模型中选择一个，粘贴自己的 API Key 即可开启 AI 拆标摘要。API Key 加密存储，不会明文回显。
        </p>
      </div>

      {existing?.configured && (
        <div className="rounded-lg bg-teal-50 border border-teal-200 px-3 py-2 text-xs text-teal-700">
          当前已配置：{existing.providerName} · {existing.model} · Key {existing.apiKeyMasked}
        </div>
      )}

      {/* 模型选择器：预置项 + 自定义 */}
      <div>
        <label className="block text-xs font-bold text-slate-600 mb-1">选择模型</label>
        <select
          className={field}
          value={selectedPresetId}
          onChange={(e) => handlePresetChange(e.target.value)}
        >
          {PRESET_LLM_MODELS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.model}
            </option>
          ))}
          <option value={CUSTOM_PRESET_ID}>
            自定义（高级用户 · 手动填写 Base URL / 模型名称）
          </option>
        </select>

        {!isCustom && currentPreset && (
          <div className="mt-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] text-slate-600 space-y-1">
            <div>
              Base URL：<span className="font-mono text-slate-800">{currentPreset.baseUrl}</span>
            </div>
            <div>
              模型名称：<span className="font-mono text-slate-800">{currentPreset.model}</span>
            </div>
            {currentPreset.docsUrl && (
              <div>
                <a
                  href={currentPreset.docsUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-teal-600 hover:underline"
                >
                  前往 {currentPreset.providerName} 申请 API Key →
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 自定义模式下展开原有三项输入 */}
      {isCustom && (
        <>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">提供商名称</label>
            <input
              className={field}
              value={form.providerName}
              maxLength={100}
              onChange={(e) => setForm({ ...form, providerName: e.target.value })}
              placeholder="如 DeepSeek"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Base URL</label>
            <input
              className={field}
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              placeholder="https://api.deepseek.com"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">模型名称</label>
            <input
              className={field}
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder="deepseek-flash / gpt-6-astra"
            />
          </div>
        </>
      )}

      <div>
        <label className="block text-xs font-bold text-slate-600 mb-1">API Key</label>
        <input
          className={field}
          type="password"
          value={form.apiKey}
          onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
          placeholder={existing?.configured ? "重新填写以更新 Key" : "sk-..."}
        />
      </div>

      {/* BYOK 数据出站告知与授权（合规） */}
      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 space-y-2">
        <p className="text-[11px] text-amber-800 leading-4">
          使用自有 API Key 时，公告原文及企业/工厂画像数据将发送至您所配置的第三方模型服务端点（如 OpenAI、DeepSeek）。该服务由您自行选择与控制，请确认其隐私政策。
        </p>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 accent-teal-600"
            checked={outboundConsent}
            onChange={(e) => setOutboundConsent(e.target.checked)}
          />
          <span className="text-[11px] font-bold text-amber-900 leading-4">
            我知晓并同意将上述数据发送至我配置的模型服务端点
          </span>
        </label>
      </div>

      {message && (
        <p
          className={`text-xs font-bold ${
            message === "保存成功" ? "text-teal-700" : "text-rose-600"
          }`}
        >
          {message}
        </p>
      )}

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={saving} variant="primary">
          {saving ? "保存中…" : "保存配置"}
        </Button>
        <Button onClick={() => router.back()} variant="outline">
          返回
        </Button>
      </div>
    </Card>
  );
}
