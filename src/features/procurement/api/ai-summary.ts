/**
 * AI 拆标摘要前端 API
 * @module features/procurement/api/ai-summary
 */
import { api } from "@/core/http";

export interface AiSummaryData {
  coreDeliverables?: string;
  keyQualifications?: string;
  paymentAndCycle?: string;
  riskAlerts?: string;
}

export interface AiSummaryResponse {
  coreDeliverables: string;
  keyQualifications: string;
  paymentCycle: string;
  riskAlerts: string;
  model: string;
  cached: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** 生成/获取 AI 摘要 */
export const generateAiSummary = (noticeId: number, forceRegenerate = false) =>
  api<{ code: number; data: AiSummaryResponse }>(`/api/notices/${noticeId}/ai-summary`, {
    method: "POST",
    body: { forceRegenerate },
  });

export interface LlmConfigData {
  configured: boolean;
  providerName?: string;
  baseUrl?: string;
  model?: string;
  apiKeyMasked?: string;
  isActive?: boolean;
}

/** 获取用户 LLM 配置状态 */
export const fetchLlmConfig = () =>
  api<{ code: number; data: LlmConfigData }>("/api/user/llm-config");
