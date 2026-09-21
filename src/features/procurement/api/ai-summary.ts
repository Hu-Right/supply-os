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

/** 只读缓存：进页面时判断是否已有历史分析（不消耗 LLM） */
export async function fetchAiSummaryCache(noticeId: number): Promise<AiSummaryResponse | null> {
  try {
    const res = await api<{ code: number; data: AiSummaryResponse & { cached: boolean } }>(
      `/api/notices/${noticeId}/ai-summary`,
    );
    return res.data?.cached ? res.data : null;
  } catch {
    return null;
  }
}

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
    // 读取响应体真实错误信息（如"公告已锁定"），而非仅 HTTP 状态码
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.message) msg = body.message;
    } catch { /* 忽略解析失败 */ }
    onError(msg);
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

export interface LlmTestResult {
  ok: boolean;
  model?: string;
  latencyMs?: number;
}

/**
 * LLM 连接测试探测（max_tokens=1 最小调用）。
 * 不传 payload → 重测已存配置；传表单值 → 测试未保存的新配置（需携授权勾选）。
 * 失败时服务端已将厂商错误码翻译为中文提示，api() 以 ApiError.message 透传。
 */
export const testLlmConnection = (payload?: {
  baseUrl: string;
  apiKey: string;
  model: string;
  outboundConsent: boolean;
}) =>
  api<{ code: number; data: LlmTestResult }>("/api/user/llm-config/test", {
    method: "POST",
    body: payload ?? {},
  });
