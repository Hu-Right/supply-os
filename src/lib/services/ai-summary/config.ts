/**
 * AI 摘要服务的预置 LLM 模型清单
 * @module lib/services/ai-summary/config
 * @description 面向非技术用户（含年龄偏大的供应商）的推荐模型选项。所有条目均为
 *              OpenAI 兼容 HTTPS 公网端点，由前端下拉选择器直接引用；用户选中后
 *              自动填充 providerName / baseUrl / model，仅需粘贴自己的 API Key。
 *              本文件为纯常量数据，无 Node/mysql 依赖，可安全被 "use client" 组件导入。
 *              新增模型时务必与 PUT /api/user/llm-config 的 OutboundUrl 校验保持一致
 *              （仅 https、非私有/环回地址），否则保存会被 zod 拒绝。
 */
import type { LlmProfile } from "./llm-profile";

export interface PresetLlmModel {
  /** 下拉选项唯一标识（同时作为 matchPresetByConfig 反查依据） */
  id: string;
  /** 提供商名称，落库到 llm_config.provider_name */
  providerName: string;
  /** OpenAI 兼容 Base URL（不含 /chat/completions 后缀） */
  baseUrl: string;
  /** 模型标识 */
  model: string;
  /** 中文说明，在下拉项与详情区展示 */
  description: string;
  /** 申请 API Key 的入口链接（可选） */
  docsUrl?: string;
  /** 服务端调用档位（超时/参数兼容）；前端组件不读取，见 llm-profile.ts */
  profile?: LlmProfile;
}

/** 自定义模式哨兵 id，前端下拉末尾固定展示 */
export const CUSTOM_PRESET_ID = "__custom__";

/**
 * 推荐模型（顺序即下拉顺序）。
 * 选模型原则：除 DeepSeek 保留 Flash + Pro 两档（项目翻译链已依赖 Flash，Pro 用于重推理场景），
 * 其余厂商只保留当前旗舰型号，避免下拉选项臃肿、也避免误导非技术用户选中中低档型号。
 * 世代基线：2026-09-17，所有 model ID 均来自厂商官方文档当日快照：
 *   - DeepSeek:   api-docs.deepseek.com/zh-cn/quick_start/pricing
 *   - 阿里百炼:   help.aliyun.com/zh/model-studio/models
 *   - 智谱:       docs.bigmodel.cn/cn/guide/start/model-overview
 *   - Moonshot:   platform.kimi.com/docs/models
 *   - OpenAI:     platform.openai.com/docs/models
 * 其中 `deepseek-flash`（V4.1 Flash）与项目翻译链 chain.ts 使用的 API 标识符一致，
 * 是唯一有代码级证据的锚点。厂商会持续发新版并下线旧模型（如 moonshot-v1-*、
 * kimi-k2-turbo-preview 均已于 2026 年下线），发现失效直接改本文件即可，
 * 前端页面通过 PRESET_LLM_MODELS 自动跟随，无需改其他地方。
 */
export const PRESET_LLM_MODELS: readonly PresetLlmModel[] = [
  {
    id: "deepseek-flash",
    providerName: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-flash",
    description: "DeepSeek V4.1 Flash · 1M 上下文，项目内置同款，性价比首选（推荐）",
    docsUrl: "https://platform.deepseek.com/",
  },
  {
    id: "deepseek-v4-pro",
    providerName: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-pro",
    description: "DeepSeek V4 Pro · 旗舰思考模型，复杂拆标与风险判定更稳",
    docsUrl: "https://platform.deepseek.com/",
    profile: { scoreTimeoutMs: 90_000 },
  },
  {
    id: "qwen3.8-max",
    providerName: "阿里云百炼",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen3.8-max",
    description: "通义千问 Qwen3.8-Max · 阿里中文旗舰，招投标语料表现优秀",
    docsUrl: "https://bailian.console.aliyun.com/",
    profile: { scoreTimeoutMs: 90_000 },
  },
  {
    id: "glm-5.3",
    providerName: "智谱 AI",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-5.3",
    description: "智谱 GLM-5.3 · 最新旗舰，1M 上下文，Agent 与长程任务能力强",
    docsUrl: "https://open.bigmodel.cn/",
    profile: { scoreTimeoutMs: 90_000 },
  },
  {
    id: "kimi-k3",
    providerName: "Moonshot",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "kimi-k3",
    description: "Kimi K3 · 2.8T 参数旗舰，1M 上下文，可整份招标文件直读",
    docsUrl: "https://platform.moonshot.cn/",
    profile: { scoreTimeoutMs: 90_000 },
  },
  {
    id: "gpt-6-astra",
    providerName: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-6-astra",
    description: "OpenAI GPT-6 Astra · 当前旗舰，1.05M 上下文（需海外支付渠道）",
    docsUrl: "https://platform.openai.com/docs/models",
    // 新版 OpenAI 模型对 temperature 等非标准采样参数返回 400，探测与正式调用均不携带
    profile: { scoreTimeoutMs: 120_000, supportsTemperature: false },
  },
];

/**
 * 依据已保存的 baseUrl + model 反查预置项。
 * 用于回填用户历史配置时决定下拉框默认选中项：命中 → 选中预置项；未命中 → 落到自定义模式。
 * 归一化：去除 baseUrl 末尾斜杠、大小写不敏感。
 */
export function matchPresetByConfig(baseUrl: string, model: string): PresetLlmModel | null {
  const b = (baseUrl || "").replace(/\/+$/, "").trim().toLowerCase();
  const m = (model || "").trim().toLowerCase();
  if (!b || !m) return null;
  return (
    PRESET_LLM_MODELS.find(
      (p) => p.baseUrl.replace(/\/+$/, "").toLowerCase() === b && p.model.toLowerCase() === m,
    ) ?? null
  );
}
