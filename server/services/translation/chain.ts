/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { channelConfigured } from "../../config/env";
import { fetchWithTimeout } from "./fetchWithTimeout";
import { GoogleGenAI } from "@google/genai";

// ── 翻译通道链（DeepSeek V4-Flash → Gemini 3.5-Flash 两层链）──
// 各通道均可缺省：未配置或失败的通道自动跳到下一层；全链失败时抛
// TRANSLATION_UNAVAILABLE，复用既有降级路径（详情 503 / 补翻静默）。
// 缓存表 model 列写入真实提供方（deepseek-v4-flash / gemini-3.5-flash）。

export type ChainResult = {
  translations: string[];
  provider: string;
  /** 降级轨迹：上游通道失败时记录 `<provider>:<原因>`，链首成功时缺省 */
  degradedFrom?: string[];
};

// 链路通用的语言全名映射（供 LLM 通道拼 prompt 用；源语言覆盖本地可检测的语种，目标含六语言）
const CHAIN_LANG_NAMES: Record<string, string> = {
  zh: "Simplified Chinese",
  en: "English",
  fr: "French",
  ru: "Russian",
  es: "Spanish",
  ar: "Arabic",
  pt: "Portuguese",
  de: "German",
  it: "Italian",
  nl: "Dutch",
  pl: "Polish",
  ro: "Romanian",
  sv: "Swedish",
  da: "Danish",
  fi: "Finnish",
  no: "Norwegian",
  hu: "Hungarian",
  tr: "Turkish",
  et: "Estonian",
  ca: "Catalan",
  id: "Indonesian",
  ms: "Malay",
  vi: "Vietnamese",
  tl: "Filipino",
  uk: "Ukrainian",
};


// MT 通道的术语保护：URL/邮箱/参考号/常见缩写抽出为占位符，译后回填；
// 任一占位符在译文中丢失即判本通道失败落下一层
const PROTECT_PATTERNS: RegExp[] = [
  /https?:\/\/[^\s)]+/g,
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
  /\b[A-Z]{2,10}(?:[-/][A-Z0-9]{1,12})*[-/][A-Z]*\d[A-Z0-9]*\b/g, // 参考号需含数字，如 RFQ-2026-0042；纯字母词（NON-GMO）不掩码
  /\b(?:UNGM|RFQ|ITB|EOI|UNSPSC|ISO|FDA|CE|GMP|RoHS|3C)\b/g,
];

export function protectTerms(text: string): { masked: string; tokens: string[] } {
  const tokens: string[] = [];
  let masked = text;
  for (const pattern of PROTECT_PATTERNS) {
    masked = masked.replace(pattern, (match) => {
      const token = `⟦T${tokens.length}⟧`;
      tokens.push(match);
      return token;
    });
  }
  return { masked, tokens };
}

function restoreTerms(text: string, tokens: string[]): string {
  let restored = text;
  for (let i = 0; i < tokens.length; i += 1) {
    // MT 可能在占位符内部/两侧插入空格（实测机器翻译会把 ⟦T1⟧ 译成 ⟦ T1⟧ ），
    // 宽松匹配回填；完全找不到才判丢失。函数式替换避免 token 内 $ 符被误解析
    const pattern = new RegExp(`\u27E6\\s*T\\s*${i}\\s*\u27E7`, "g");
    if (!restored.match(pattern)) throw new Error("MT_PLACEHOLDER_LOST");
    restored = restored.replace(pattern, () => tokens[i]);
  }
  return restored;
}

const DEEPSEEK_TIMEOUT_MS = 10_000; // flash 模型正常 <1s 返回；10s 足以覆盖慢响应+CDN 挂死
const DEEPSEEK_MAX_RETRIES = 3;       // 429/5xx 最多重试 3 次（共 4 次尝试）
const DEEPSEEK_RETRY_BASE_MS = 1_500; // 重试基础间隔 1.5s，指数退避：1.5s → 3s → 6s

// ── 熔断器：连续 N 次 503/超时后暂停 DeepSeek 通道，避免服务过载时无意义请求 ──
const DEEPSEEK_CIRCUIT_THRESHOLD = 3;  // 连续 3 次失败触发熔断
const DEEPSEEK_CIRCUIT_COOLDOWN_MS = 60_000; // 熔断冷却 60 秒
let circuitBreakerTripped = false;
let circuitBreakerTrippedAt = 0;
let consecutiveFailures = 0;

function circuitBreakerAllow(): boolean {
  if (!circuitBreakerTripped) return true;
  if (Date.now() - circuitBreakerTrippedAt >= DEEPSEEK_CIRCUIT_COOLDOWN_MS) {
    // 冷却期结束，重置熔断器（半开状态允许一次请求试探恢复）
    circuitBreakerTripped = false;
    consecutiveFailures = 0;
    console.warn("[translate] deepseek circuit breaker: cooldown elapsed, retrying");
    return true;
  }
  return false;
}

function circuitBreakerRecordSuccess() {
  consecutiveFailures = 0;
  circuitBreakerTripped = false;
}

function circuitBreakerRecordFailure() {
  consecutiveFailures++;
  if (consecutiveFailures >= DEEPSEEK_CIRCUIT_THRESHOLD && !circuitBreakerTripped) {
    circuitBreakerTripped = true;
    circuitBreakerTrippedAt = Date.now();
    console.warn(`[translate] deepseek circuit breaker: TRIIPPED after ${consecutiveFailures} consecutive failures, cooldown ${DEEPSEEK_CIRCUIT_COOLDOWN_MS / 1000}s`);
  }
}

// 判断 DeepSeek 错误是否可重试（429 限流 / 5xx 服务端错误 / 超时 / 空响应 / 占位符丢失）
// DEEPSEEK_EMPTY：模型偶发返回空内容，通常为瞬时异常，重试成功率高
// MT_PLACEHOLDER_LOST：模型偶发破坏占位符，重试通常可恢复
function isDeepSeekRetryable(errMsg: string): boolean {
  return /DEEPSEEK_HTTP_(429|500|502|503|504)/.test(errMsg) ||
    errMsg === "CHANNEL_TIMEOUT" ||
    errMsg === "DEEPSEEK_EMPTY" ||
    errMsg === "MT_PLACEHOLDER_LOST";
}

// 通道1：DeepSeek V4-Flash（OpenAI 兼容 /chat/completions，flash 快速模型）
// 认证需配置 DEEPSEEK_API_KEY；未配置即跳过本通道。作为 LLM 中间层：
// DeepSeek Flash 对长描述/上下文语义更准，担任翻译链第一层。
// flash 模型不支持 thinking/reasoning_effort 参数，译文直接取 content。
// 占位符沿用链上统一的 ⟦Tn⟧，由 prompt 明确要求原样保留，返回后经 restoreTerms 回填。
// 合并请求模式：标题+正文等多段以 JSON 数组一次进出——一次思考翻完全部字段，
// 段间共享上下文、术语一致，且省去多次深度思考的延迟与 token 开销；
// 返回数组长度/形状不符即判失败。不设单次长度与每日软额度限制，
// 超长/超量由 API 自身报错（HTTP 400/402/429 等）后抛 TRANSLATION_UNAVAILABLE。

// DeepSeek 单次翻译（无重试）：被 translateViaDeepSeek 包装调用
async function translateViaDeepSeekOnce(
  texts: string[],
  sourceLang: string,
  targetLang: string
): Promise<string[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  // 源语言映射缺失不再跳过：LLM 通道无需显式源语言（prompt 省略源语言名即可自行识别）
  const sourceName = CHAIN_LANG_NAMES[sourceLang];
  const targetName = CHAIN_LANG_NAMES[targetLang];
  if (!channelConfigured(apiKey) || !targetName) throw new Error("CHANNEL_SKIPPED");
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  const prompt = `Translate each ${sourceName ? `${sourceName} ` : ""}procurement text in the JSON array below into ${targetName}.
Rules:
- Keep every ⟦Tn⟧ placeholder (e.g. ⟦T0⟧, ⟦T1⟧) exactly as-is, unchanged and in place.
- Preserve line breaks inside each string.
- Keep terminology consistent across all strings (they belong to the same tender notice).
- Return ONLY a JSON array of ${texts.length} translated strings in the same order, with no explanations and no markdown fences.

${JSON.stringify(texts)}`;
  const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${String(apiKey)}`,
    },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: prompt }],
      stream: false,
    }),
  }, DEEPSEEK_TIMEOUT_MS);
  if (!res.ok) throw new Error(`DEEPSEEK_HTTP_${res.status}`);
  const data: any = await res.json();
  const content = String(data?.choices?.[0]?.message?.content ?? "").trim();
  if (!content) throw new Error("DEEPSEEK_EMPTY");
  // 容错剥掉模型偶发包裹的 ```json 围栏后按 JSON 数组解析
  const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("DEEPSEEK_BAD_JSON");
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== texts.length ||
    !parsed.every((item) => typeof item === "string" && item.trim() !== "")
  ) {
    throw new Error("DEEPSEEK_BAD_SHAPE");
  }
  return (parsed as string[]).map((item) => item.trim());
}

// DeepSeek 带重试 + 熔断的包装：429/5xx/超时自动指数退避重试，其余错误立即抛出
// 熔断器：连续 N 次可重试失败后暂停通道，冷却期后自动恢复
async function translateViaDeepSeek(
  texts: string[],
  sourceLang: string,
  targetLang: string
): Promise<string[]> {
  // 熔断器激活时直接跳过，不浪费请求
  if (!circuitBreakerAllow()) {
    throw new Error("DEEPSEEK_CIRCUIT_BREAKER_OPEN");
  }
  let lastErr: any;
  for (let attempt = 0; attempt <= DEEPSEEK_MAX_RETRIES; attempt++) {
    try {
      const result = await translateViaDeepSeekOnce(texts, sourceLang, targetLang);
      circuitBreakerRecordSuccess();
      return result;
    } catch (err: any) {
      lastErr = err;
      const errMsg = err?.message || "";
      if (attempt < DEEPSEEK_MAX_RETRIES && isDeepSeekRetryable(errMsg)) {
        const delayMs = DEEPSEEK_RETRY_BASE_MS * Math.pow(2, attempt);
        console.warn(`[translate] deepseek retry ${attempt + 1}/${DEEPSEEK_MAX_RETRIES} after ${delayMs}ms: ${errMsg}`);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      // 不可重试或重试耗尽：记录熔断器
      if (isDeepSeekRetryable(errMsg)) {
        circuitBreakerRecordFailure();
      }
      throw err;
    }
  }
  throw lastErr;
}

// ── Gemini 3.5-Flash 兜底层 ──────────────────────────────────────────
// 作为第二层兜底，仅在 DeepSeek 失败时触发。
// 使用 @google/genai SDK，模型 gemini-3.5-flash。
const GEMINI_TIMEOUT_MS = 60_000;

async function translateViaGemini(
  texts: string[],
  sourceLang: ChainSourceLang,
  targetLang: string
): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!channelConfigured(apiKey)) throw new Error("GEMINI_NOT_CONFIGURED");

  const sourceName = CHAIN_LANG_NAMES[sourceLang];
  const targetName = CHAIN_LANG_NAMES[targetLang] || targetLang;
  if (!targetName) throw new Error("GEMINI_UNSUPPORTED_TARGET");
  const direction = sourceName ? `from ${sourceName} to ${targetName}` : `to ${targetName}`;

  const prompt = `You are a professional translator. Translate the following JSON array of strings ${direction}.
Rules:
- Return ONLY a JSON array of ${texts.length} translated strings in the same order, with no explanations and no markdown fences.
- Preserve line breaks inside each string.
- Keep terminology consistent across all strings.

${JSON.stringify(texts)}`;

  const ai = new GoogleGenAI({
    apiKey: apiKey!,
    httpOptions: { timeout: GEMINI_TIMEOUT_MS },
  });

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
  });

  const content = String(response.text || "").trim();
  if (!content) throw new Error("GEMINI_EMPTY");

  // 容错剥掉模型偶发包裹的 ```json 围栏后按 JSON 数组解析
  const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("GEMINI_BAD_JSON");
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== texts.length ||
    !parsed.every((item) => typeof item === "string" && item.trim() !== "")
  ) {
    throw new Error("GEMINI_BAD_SHAPE");
  }
  return (parsed as string[]).map((item) => item.trim());
}

// 通道链入口：空文本原样透传（供应商空字段等）；目标含六语言（zh/en/fr/ru/es/ar）
// 统一走 DeepSeek→Gemini 两层。DeepSeek 通道对未知源语言省略语言名（LLM 自行识别）；
// Gemini 作为最终兜底。
// 两通道均失败/未配置时抛 TRANSLATION_UNAVAILABLE，由各调用方既有降级路径处理。
export type ChainSourceLang =
  | "en" | "zh" | "ru" | "ar" | "fr" | "es" | "pt" | "de" | "it"
  | "nl" | "pl" | "ro" | "sv" | "da" | "fi" | "no" | "hu" | "tr" | "et"
  | "ca" | "id" | "ms" | "vi" | "tl" | "uk"
  | "auto";

export async function translateViaChain(
  texts: string[],
  sourceLang: ChainSourceLang,
  targetLang: string
): Promise<ChainResult> {
  const jobs = texts
    .map((text, index) => ({ text, index }))
    .filter((job) => job.text.trim() !== "");
  if (jobs.length === 0) return { translations: texts, provider: "none" };

  const assemble = (translated: Map<number, string>): string[] =>
    texts.map((text, index) => translated.get(index) ?? text);

  // 降级轨迹：记录被跳过的上游通道及原因，供调用方打结构化日志
  const degraded: string[] = [];

  // ── 通道1：DeepSeek V4-Flash ──
  try {
    // 合并请求：所有段一次过 DeepSeek（各段独立 protectTerms，占位符互不干扰）
    const masks = jobs.map((job) => protectTerms(job.text));
    const outputs = await translateViaDeepSeek(
      masks.map((m) => m.masked),
      sourceLang,
      targetLang
    );
    const translated = new Map<number, string>();
    jobs.forEach((job, i) => {
      translated.set(job.index, restoreTerms(outputs[i], masks[i].tokens));
    });
    return {
      translations: assemble(translated),
      provider: "deepseek-v4-flash",
      ...(degraded.length ? { degradedFrom: degraded } : {}),
    };
  } catch (err: any) {
    // 未配置/失败/形状不符：落下一通道
    degraded.push(`deepseek-v4-flash:${err?.message}`);
    console.warn(`[translate] deepseek -> next: ${err?.message}`);
  }
  // 通道2：Gemini 3.5-Flash 兜底
  try {
    const masks = jobs.map((job) => protectTerms(job.text));
    const outputs = await translateViaGemini(
      masks.map((m) => m.masked),
      sourceLang,
      targetLang
    );
    const translated = new Map<number, string>();
    jobs.forEach((job, i) => {
      translated.set(job.index, restoreTerms(outputs[i], masks[i].tokens));
    });
    return {
      translations: assemble(translated),
      provider: "gemini-3.5-flash",
      ...(degraded.length ? { degradedFrom: degraded } : {}),
    };
  } catch (err: any) {
    // 链尾无后续通道
    degraded.push(`gemini-3.5-flash:${err?.message}`);
    console.warn(`[translate] gemini -> unavailable: ${err?.message}`);
  }
  // 两通道均失败/未配置：抛统一错误码，复用既有降级路径（详情 503 / 补翻静默）
  // 附带降级轨迹供调用方诊断（如 deepseek-v4-flash:DEEPSEEK_HTTP_429,gemini-3.5-flash:GEMINI_NOT_CONFIGURED）
  const chainErr = new Error("TRANSLATION_UNAVAILABLE");
  (chainErr as any).degradedFrom = degraded;
  throw chainErr;
}
