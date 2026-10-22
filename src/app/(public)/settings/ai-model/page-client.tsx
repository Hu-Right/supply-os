"use client";
/**
 * AI 模型配置页 — 容器
 * @module app/(public)/settings/ai-model/page-client
 * @description 面向非技术用户：通过下拉选择器切换预置模型（DeepSeek / 通义 / 智谱 / Kimi / OpenAI 等），
 *              自动填充 Base URL 与模型名；用户只需粘贴 API Key。
 *              下拉末尾提供"自定义"选项，展开原有三输入框以支持任意 OpenAI 兼容端点。
 *              保存调用 PUT /api/user/llm-config，apiKey 不做本地持久化。
 *              保存成功后自动发起一次连接测试（POST /api/user/llm-config/test，
 *              max_tokens=1 最小探测），把 Key 无效/模型名错/欠费等错误提前暴露为中文提示。
 *
 *              2026-10 组件化拆分（332→约 190 行）：选择器/自定义字段/授权告知/消息行
 *              见 ./components/parts，JSX 逐字不变；本文件保留表单状态与保存/测试编排。
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/shared/ui";
import { api } from "@/core/http";
import {
  fetchLlmConfig,
  testLlmConnection,
  type LlmConfigData,
} from "@/features/procurement/api/ai-summary";
import {
  PRESET_LLM_MODELS,
  CUSTOM_PRESET_ID,
  matchPresetByConfig,
} from "@/lib/services/ai-summary/config";
import { ModelSelector, CustomFields, ApiKeyField, ConsentNotice, MessageLine, type LlmForm } from "./components/parts";

export default function AiModelSettingsClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  /** 提示语义：驱动 message 颜色（成功青/失败红/进行中灰） */
  const [messageKind, setMessageKind] = useState<"ok" | "err" | "pending">("err");
  const [testing, setTesting] = useState(false);
  const [existing, setExisting] = useState<LlmConfigData | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(PRESET_LLM_MODELS[0].id);
  const [form, setForm] = useState<LlmForm>({
    providerName: PRESET_LLM_MODELS[0].providerName,
    baseUrl: PRESET_LLM_MODELS[0].baseUrl,
    apiKey: "",
    model: PRESET_LLM_MODELS[0].model,
  });
  /** BYOK 数据出站授权（合规：后端保存时强制校验并写入同意审计日志） */
  const [outboundConsent, setOutboundConsent] = useState(false);

  const isCustom = selectedPresetId === CUSTOM_PRESET_ID;

  useEffect(() => {
    fetchLlmConfig()
      .then((res) => {
        const d = res;
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

  /** 发起连接测试：payload 缺省时重测已存配置（服务端解密 Key），否则测表单新配置 */
  const runConnectionTest = async (payload?: {
    baseUrl: string;
    apiKey: string;
    model: string;
    outboundConsent: boolean;
  }) => {
    setTesting(true);
    setMessageKind("pending");
    setMessage("正在测试连接…");
    try {
      const res = await testLlmConnection(payload);
      const ms = res.latencyMs;
      setMessageKind("ok");
      setMessage(`连接成功：${res.model || "已配置模型"}${ms != null ? `（耗时 ${(ms / 1000).toFixed(1)} 秒）` : ""}`);
    } catch (err) {
      setMessageKind("err");
      setMessage(`连接失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setTesting(false);
    }
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
      setForm((f) => ({ ...f, apiKey: "" }));
      const res = await fetchLlmConfig();
      setExisting(res);
      // 保存成功后自动验证连通性：成功/失败均写回 message（失败不阻断保存结果，
      // 配置已落库，用户可按提示修 Key/模型名后重测）
      await runConnectionTest();
    } catch (err) {
      setMessageKind("err");
      setMessage(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  /** 测当前表单（未保存）：要求 Key/URL/模型名齐全且已勾选出站授权 */
  const handleTestForm = () => {
    if (!form.baseUrl.trim() || !form.model.trim() || !form.apiKey.trim()) {
      setMessageKind("err");
      setMessage("测试当前填写的配置需先补齐 Base URL、模型名称与 API Key");
      return;
    }
    if (!outboundConsent) {
      setMessageKind("err");
      setMessage("请先勾选数据出站授权");
      return;
    }
    void runConnectionTest({
      baseUrl: form.baseUrl.trim(),
      apiKey: form.apiKey.trim(),
      model: form.model.trim(),
      outboundConsent: true,
    });
  };

  if (loading) {
    return <div className="py-16 text-center text-sm text-slate-400">加载中…</div>;
  }

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

      <ModelSelector selectedPresetId={selectedPresetId} onChange={handlePresetChange} />

      {/* 自定义模式下展开原有三项输入 */}
      {isCustom && <CustomFields form={form} onChange={setForm} />}

      <ApiKeyField value={form.apiKey} onChange={(v) => setForm({ ...form, apiKey: v })} configured={!!existing?.configured} />

      <ConsentNotice checked={outboundConsent} onChange={setOutboundConsent} />

      <MessageLine message={message} kind={messageKind} />

      <div className="flex gap-3 flex-wrap">
        <Button onClick={handleSave} disabled={saving} variant="primary">
          {saving ? "保存中…" : "保存配置"}
        </Button>
        {/* 测当前表单（含未保存的新 Key）；保存成功后会自动重测已存配置 */}
        <Button onClick={handleTestForm} disabled={testing || saving} variant="secondary">
          {testing ? "测试中…" : "测试连接"}
        </Button>
        <Button onClick={() => router.back()} variant="outline">
          返回
        </Button>
      </div>
    </Card>
  );
}
