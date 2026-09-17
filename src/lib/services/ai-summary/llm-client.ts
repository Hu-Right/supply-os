/**
 * OpenAI 兼容 LLM 客户端
 * @module lib/services/ai-summary/llm-client
 * @description 调用任意 OpenAI 兼容 /chat/completions 端点（用户自带 Key）。
 *              复用 translation 层的 fetchWithTimeout（30s 硬超时 + SSRF 净化）。
 *              响应要求为严格 JSON（4 维度字段），容错剥离 markdown 围栏。
 */
import { fetchWithTimeout } from "../translation/fetchWithTimeout";

const LLM_TIMEOUT_MS = 30_000;

export interface AiSummaryRaw {
  coreDeliverables: string;
  keyQualifications: string;
  paymentCycle: string;
  riskAlerts: string;
}

export interface LlmCallResult {
  data: AiSummaryRaw;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface LlmCredentials {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** 解析 LLM 返回文本为 4 维度对象（容错 markdown 围栏与前后杂讯） */
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
    riskAlerts: str(o.riskAlerts),
  };
}

/** 调用 OpenAI 兼容端点 */
export async function callLlmForSummary(
  creds: LlmCredentials,
  systemPrompt: string,
  userPrompt: string,
): Promise<LlmCallResult> {
  const baseUrl = creds.baseUrl.replace(/\/+$/, "");
  const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${creds.apiKey}`,
    },
    body: JSON.stringify({
      model: creds.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: false,
      temperature: 0.3,
    }),
  }, LLM_TIMEOUT_MS);

  if (!res.ok) throw new Error(`LLM_HTTP_${res.status}`);
  const body: any = await res.json();
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
