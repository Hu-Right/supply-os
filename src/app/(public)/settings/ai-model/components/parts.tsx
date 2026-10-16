"use client";

/**
 * AI 模型配置页 — 展示件集合（自 page-client.tsx 拆出，JSX 逐字不变）。
 * 表单状态与保存/测试编排留在容器；本文件只管呈现。
 *
 * @module app/(public)/settings/ai-model/components/parts
 */
import { memo } from "react";
import {
  PRESET_LLM_MODELS,
  CUSTOM_PRESET_ID,
} from "@/lib/services/ai-summary/config";

export const FIELD_CLS =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-400 focus:outline-none";

/** 模型选择器：预置项 + 自定义；非自定义时展示预置说明卡（Base URL/模型名/申请文档链接） */
export const ModelSelector = memo(function ModelSelector({
  selectedPresetId,
  onChange,
}: {
  selectedPresetId: string;
  onChange: (id: string) => void;
}) {
  const isCustom = selectedPresetId === CUSTOM_PRESET_ID;
  const currentPreset = PRESET_LLM_MODELS.find((p) => p.id === selectedPresetId) ?? null;
  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 mb-1">选择模型</label>
      <select
        className={FIELD_CLS}
        value={selectedPresetId}
        onChange={(e) => onChange(e.target.value)}
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
  );
});

export interface LlmForm {
  providerName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** 自定义模式下展开的三项输入 */
export const CustomFields = memo(function CustomFields({
  form,
  onChange,
}: {
  form: LlmForm;
  onChange: (next: LlmForm) => void;
}) {
  return (
    <>
      <div>
        <label className="block text-xs font-bold text-slate-600 mb-1">提供商名称</label>
        <input
          className={FIELD_CLS}
          value={form.providerName}
          maxLength={100}
          onChange={(e) => onChange({ ...form, providerName: e.target.value })}
          placeholder="如 DeepSeek"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-600 mb-1">Base URL</label>
        <input
          className={FIELD_CLS}
          value={form.baseUrl}
          onChange={(e) => onChange({ ...form, baseUrl: e.target.value })}
          placeholder="https://api.deepseek.com"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-600 mb-1">模型名称</label>
        <input
          className={FIELD_CLS}
          value={form.model}
          onChange={(e) => onChange({ ...form, model: e.target.value })}
          placeholder="deepseek-flash / gpt-6-astra"
        />
      </div>
    </>
  );
});

/** API Key 输入（已配置时占位提示为更新语义） */
export const ApiKeyField = memo(function ApiKeyField({
  value,
  onChange,
  configured,
}: {
  value: string;
  onChange: (v: string) => void;
  configured: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 mb-1">API Key</label>
      <input
        className={FIELD_CLS}
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={configured ? "重新填写以更新 Key" : "sk-..."}
      />
    </div>
  );
});

/** BYOK 数据出站告知与授权（合规：后端保存时强制校验并写入同意审计日志） */
export const ConsentNotice = memo(function ConsentNotice({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 space-y-2">
      <p className="text-[11px] text-amber-800 leading-4">
        使用自有 API Key 时，公告原文及企业/工厂画像数据将发送至您所配置的第三方模型服务端点（如 OpenAI、DeepSeek）。该服务由您自行选择与控制，请确认其隐私政策。
      </p>
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5 accent-teal-600"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="text-[11px] font-bold text-amber-900 leading-4">
          我知晓并同意将上述数据发送至我配置的模型服务端点
        </span>
      </label>
    </div>
  );
});

/** 结果消息行：提示语义驱动颜色（成功青/失败红/进行中灰） */
export const MessageLine = memo(function MessageLine({
  message,
  kind,
}: {
  message: string;
  kind: "ok" | "err" | "pending";
}) {
  if (!message) return null;
  return (
    <p
      className={`text-xs font-bold ${
        kind === "ok"
          ? "text-teal-700"
          : kind === "pending"
            ? "text-slate-500"
            : "text-rose-600"
      }`}
    >
      {message}
    </p>
  );
});
