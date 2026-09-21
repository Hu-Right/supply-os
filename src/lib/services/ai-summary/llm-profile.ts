/**
 * LLM 模型参数档位（服务端共享）
 * @module lib/services/ai-summary/llm-profile
 * @description BYOK 模式下所有预置/自定义模型都经统一 OpenAI 兼容客户端调用，
 *              但各家端点能力不同（推理旗舰首 token 慢、新版 OpenAI 拒绝非标准参数），
 *              本文件按预置项声明差异化档位，由 resolveLlmCredentials / 测试连接探测统一挂载。
 *              ⚠️ 仅服务端字段：config.ts 的 PresetLlmModel 供 "use client" 组件导入，
 *              profile 不得出现在前端 import 链路上（本文件无 Node 依赖，但语义上仅服务端使用）。
 *              档位随厂商模型演进调整，直接改 PRESET_LLM_MODELS 条目的 profile 即可。
 */
import { PRESET_LLM_MODELS } from "./config";

/** 自定义（未命中预置）端点的兜底超时：与档位化之前的历史行为一致 */
export const DEFAULT_SUMMARY_TIMEOUT_MS = 60_000;
export const DEFAULT_SCORE_TIMEOUT_MS = 30_000;
/** 测试连接探测：连通性验证无需生成内容，收紧到 15s 让用户快点拿到结论 */
export const PROBE_TIMEOUT_MS = 15_000;

export interface LlmProfile {
  /** 非流式摘要超时（毫秒），缺省 = DEFAULT_SUMMARY_TIMEOUT_MS */
  summaryTimeoutMs?: number;
  /** 评分/匹配调用超时（毫秒），缺省 = DEFAULT_SCORE_TIMEOUT_MS */
  scoreTimeoutMs?: number;
  /** 端点是否接受 temperature 参数；false 时请求体不携带（新版 OpenAI 对非标准参数返回 400） */
  supportsTemperature?: boolean;
}

/** 服务端挂载到凭证上的完整档位（缺省已填充） */
export interface ResolvedLlmProfile {
  summaryTimeoutMs: number;
  scoreTimeoutMs: number;
  supportsTemperature: boolean;
}

/**
 * 依据已保存的 baseUrl + model 反查预置档位（归一化规则与 matchPresetByConfig 一致：
 * 去末尾斜杠、大小写不敏感）。未命中预置（自定义端点）时返回全默认档位。
 */
export function resolveLlmProfile(baseUrl: string, model: string): ResolvedLlmProfile {
  const b = (baseUrl || "").replace(/\/+$/, "").trim().toLowerCase();
  const m = (model || "").trim().toLowerCase();
  const preset = b && m
    ? PRESET_LLM_MODELS.find(
        (p) => p.baseUrl.replace(/\/+$/, "").toLowerCase() === b && p.model.toLowerCase() === m,
      ) ?? null
    : null;
  return {
    summaryTimeoutMs: preset?.profile?.summaryTimeoutMs ?? DEFAULT_SUMMARY_TIMEOUT_MS,
    scoreTimeoutMs: preset?.profile?.scoreTimeoutMs ?? DEFAULT_SCORE_TIMEOUT_MS,
    supportsTemperature: preset?.profile?.supportsTemperature ?? true,
  };
}
