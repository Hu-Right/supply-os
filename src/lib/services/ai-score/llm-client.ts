/**
 * AI 适配评分 LLM 客户端
 * @module lib/services/ai-score/llm-client
 * @description 调用 OpenAI 兼容端点获取 7 维度评分 JSON。
 */
import { fetchWithTimeout } from "../translation/fetchWithTimeout";
import { DEFAULT_SCORE_TIMEOUT_MS } from "../ai-summary/llm-profile";
import type { AiScoreRaw, ScoreDimension, DimensionDetail } from "./prompt";
import { SCORE_DIMENSIONS } from "./prompt";

export interface LlmCredentials {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 非流式摘要超时（毫秒），由模型档位挂载；缺省 60s（历史行为） */
  summaryTimeoutMs?: number;
  /** 评分/匹配调用超时（毫秒），由模型档位挂载；缺省 30s（历史行为） */
  scoreTimeoutMs?: number;
  /** 端点是否接受 temperature，false 时请求体不携带（仅显式传 false 才剔除） */
  supportsTemperature?: boolean;
}

/** 解析 LLM 返回文本为评分对象（含推理过程） */
export function parseAiScoreResponse(content: string): AiScoreRaw & { reasoning: string } {
  // 提取推理过程（JSON 块之前的文本）
  const jsonStart = content.search(/\{[\s]*"(?:qualification|experience)"/);
  const backtickPrefix = new RegExp("^```[\\s\\S]*?\\n?");
  const rawReasoning = jsonStart > 0 ? content.slice(0, jsonStart).trim() : "";
  const reasoning = rawReasoning ? rawReasoning.replace(backtickPrefix, "").trim() : "";

  const cleaned = content.replace(/^[\s\S]*?(?=\{)/, "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!objMatch) throw new Error("LLM_BAD_JSON");
    try { parsed = JSON.parse(objMatch[0]); } catch { throw new Error("LLM_BAD_JSON"); }
  }
  if (!parsed || typeof parsed !== "object") throw new Error("LLM_BAD_SHAPE");
  const o = parsed as Record<string, unknown>;
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 50;
  };

  // 解析结构化证据：优先 details（新格式），兼容 reasons（旧格式）
  const rawDetails = (o.details && typeof o.details === "object" ? o.details : {}) as Record<string, unknown>;
  const rawReasons = (o.reasons && typeof o.reasons === "object" ? o.reasons : {}) as Record<string, unknown>;
  const strArr = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 5) : []);

  const details = Object.fromEntries(
    SCORE_DIMENSIONS.map((d) => {
      const det = (rawDetails[d] && typeof rawDetails[d] === "object" ? rawDetails[d] : {}) as Record<string, unknown>;
      const detail: DimensionDetail = {
        reason: String(det.reason ?? rawReasons[d] ?? "").trim(),
        matched: strArr(det.matched),
        gaps: strArr(det.gaps),
      };
      return [d, detail];
    }),
  ) as Record<ScoreDimension, DimensionDetail>;

  return {
    qualification: num(o.qualification),
    experience: num(o.experience),
    certification: num(o.certification),
    region: num(o.region),
    scale: num(o.scale),
    delivery: num(o.delivery),
    price: num(o.price),
    overall: num(o.overall),
    details,
    reasoning,
  };
}

/** 调用 OpenAI 兼容端点获取评分（超时/temperature 按凭证挂载的模型档位适配） */
export async function callLlmForScore(
  creds: LlmCredentials,
  systemPrompt: string,
  userPrompt: string,
): Promise<{ data: AiScoreRaw; model: string }> {
  const baseUrl = creds.baseUrl.replace(/\/+$/, "");
  const payload: Record<string, unknown> = {
    model: creds.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    stream: false,
  };
  if (creds.supportsTemperature !== false) payload.temperature = 0.2;
  const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${creds.apiKey}`,
    },
    body: JSON.stringify(payload),
  }, creds.scoreTimeoutMs ?? DEFAULT_SCORE_TIMEOUT_MS);

  if (!res.ok) throw new Error(`LLM_HTTP_${res.status}`);
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = String(body?.choices?.[0]?.message?.content ?? "").trim();
  if (!content) throw new Error("LLM_EMPTY");
  return { data: parseAiScoreResponse(content), model: creds.model };
}
