/**
 * AI 拆标摘要前端 API v2
 * @module features/procurement/api/ai-summary
 * @description 支持 6 维度 + 流式 SSE 请求。
 */
import { api, getAuthToken } from "@/core/http";

export interface AiSummaryData {
  coreDeliverables?: string;
  keyQualifications?: string;
  paymentAndCycle?: string;
  competitiveLandscape?: string;
  bidStrategy?: string;
  riskAlerts?: string;
}

export interface AiSummaryResponse {
  coreDeliverables: string;
  keyQualifications: string;
  paymentCycle: string;
  competitiveLandscape: string;
  bidStrategy: string;
  riskAlerts: string;
  model: string;
  cached: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** 生成/获取 AI 摘要（非流式，用于缓存回填） */
export const generateAiSummary = (noticeId: number, forceRegenerate = false) =>
  api<{ code: number; data: AiSummaryResponse }>(`/api/notices/${noticeId}/ai-summary`, {
    method: "POST",
    body: { forceRegenerate },
  });

/**
 * 流式 AI 摘要（SSE）
 * @param noticeId 公告 ID
 * @param onChunk 每收到一个文本片段的回调
 * @param onDone 流结束回调，参数为完整 JSON 字符串
 * @param onError 错误回调
 */
export async function streamAiSummary(
  noticeId: number,
  onChunk: (text: string) => void,
  onDone: (fullJson: string) => void,
  onError: (msg: string) => void,
): Promise<void> {
  const authToken = getAuthToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  const res = await fetch(`/api/notices/${noticeId}/ai-summary/stream`, {
    method: "POST",
    headers,
    credentials: "same-origin",
  });

  if (!res.ok) {
    onError(`HTTP ${res.status}`);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) { onError("无响应体"); return; }

  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") { onDone(fullText); return; }

      // 尝试解析为 JSON（缓存命中时直接推送完整 JSON）
      try {
        const parsed = JSON.parse(data);
        if (parsed.error) { onError(parsed.error); return; }
        // 完整 JSON 响应（缓存命中）
        if (parsed.coreDeliverables !== undefined) {
          onDone(data);
          return;
        }
      } catch {
        // 非 JSON，当作流式文本片段
      }

      fullText += data;
      onChunk(data);
    }
  }

  onDone(fullText);
}

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
