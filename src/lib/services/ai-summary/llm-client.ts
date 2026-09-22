/**
 * OpenAI 兼容 LLM 客户端 v2
 * @module lib/services/ai-summary/llm-client
 * @description 支持非流式（缓存回填）和流式 SSE（逐 token 推送）两种模式。
 *              流式模式返回 AsyncIterable<string>，逐块 yield 原始文本片段。
 *              复用 translation 层的 fetchWithTimeout（SSRF 净化）。
 *              凭证类型与 ai-score 共用（超时/temperature 按模型档位适配）。
 */
import { fetchWithTimeout } from "../translation/fetchWithTimeout";
import { DEFAULT_SUMMARY_TIMEOUT_MS } from "./llm-profile";
import type { LlmCredentials } from "../ai-score/llm-client";

export type { LlmCredentials };

export interface AiSummaryRaw {
  coreDeliverables: string;
  keyQualifications: string;
  paymentCycle: string;
  competitiveLandscape: string;
  bidStrategy: string;
  riskAlerts: string;
}

export interface LlmCallResult {
  data: AiSummaryRaw;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** 解析 LLM 返回文本为 6 维度对象（容错 markdown 围栏与前后杂讯） */
export function parseAiSummaryResponse(content: string): AiSummaryRaw {
  const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!objMatch) throw new Error("LLM_BAD_JSON");
    try {
      parsed = JSON.parse(objMatch[0]);
    } catch {
      throw new Error("LLM_BAD_JSON");
    }
  }
  if (!parsed || typeof parsed !== "object") throw new Error("LLM_BAD_SHAPE");
  const o = parsed as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return {
    coreDeliverables: str(o.coreDeliverables),
    keyQualifications: str(o.keyQualifications),
    paymentCycle: str(o.paymentCycle),
    competitiveLandscape: str(o.competitiveLandscape),
    bidStrategy: str(o.bidStrategy),
    riskAlerts: str(o.riskAlerts),
  };
}

/** 非流式调用（用于缓存回填） */
export async function callLlmForSummary(
  creds: LlmCredentials,
  systemPrompt: string,
  userPrompt: string,
): Promise<LlmCallResult> {
  const baseUrl = creds.baseUrl.replace(/\/+$/, "");
  const payload: Record<string, unknown> = {
    model: creds.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    stream: false,
  };
  if (creds.supportsTemperature !== false) payload.temperature = 0.3;
  const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${creds.apiKey}`,
    },
    body: JSON.stringify(payload),
  }, creds.summaryTimeoutMs ?? DEFAULT_SUMMARY_TIMEOUT_MS);

  if (!res.ok) throw new Error(`LLM_HTTP_${res.status}`);
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = String(body?.choices?.[0]?.message?.content ?? "").trim();
  if (!content) throw new Error("LLM_EMPTY");
  const data = parseAiSummaryResponse(content);
  return {
    data,
    model: creds.model,
    inputTokens: body?.usage?.prompt_tokens ?? null,
    outputTokens: body?.usage?.completion_tokens ?? null,
  };
}

/**
 * 流式调用：返回 AsyncIterable<string>
 * 每个 chunk 是 SSE data 行中的 content 文本片段（非完整 JSON）
 */
export async function* callLlmForSummaryStream(
  creds: LlmCredentials,
  systemPrompt: string,
  userPrompt: string,
): AsyncIterable<string> {
  const baseUrl = creds.baseUrl.replace(/\/+$/, "");
  const payload: Record<string, unknown> = {
    model: creds.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    stream: true,
  };
  if (creds.supportsTemperature !== false) payload.temperature = 0.3;
  const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${creds.apiKey}`,
    },
    body: JSON.stringify(payload),
  }, creds.summaryTimeoutMs ?? DEFAULT_SUMMARY_TIMEOUT_MS);

  if (!res.ok) throw new Error(`LLM_HTTP_${res.status}`);
  if (!res.body) throw new Error("LLM_NO_BODY");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

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
      if (data === "[DONE]") return;

      try {
        const parsed = JSON.parse(data);
        const content = parsed?.choices?.[0]?.delta?.content;
        if (content) yield content;
      } catch {
        // 跳过无法解析的 SSE 行
      }
    }
  }
}
