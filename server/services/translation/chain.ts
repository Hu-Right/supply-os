/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import crypto from "crypto";
import { channelConfigured } from "../../config/env";
import { fetchWithTimeout } from "./fetchWithTimeout";
import { youdaoPool } from "./youdaoPool";
import { GoogleGenAI } from "@google/genai";

// ── 翻译通道链（有道智云 → DeepSeek V4-Pro → Gemini 3.5-Flash 三层链）──
// 各通道均可缺省：未配置或失败的通道自动跳到下一层；全链失败时抛
// TRANSLATION_UNAVAILABLE，复用既有降级路径（详情 503 / 补翻静默）。
// 缓存表 model 列写入真实提供方（youdao-llm / deepseek-v4-pro / gemini-3.5-flash）。

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

// 通道1：有道智云 大模型翻译（子曰 Pro 14B，SSE 流式响应）
// 认证需同时配置 YOUDAO_APP_KEY(应用ID) 与 YOUDAO_APP_SECRET(应用密钥)，缺一即跳过本通道；
// sign = SHA256(appKey + input + salt + curtime + appSecret)，input 规则见 youdaoInput()。
// 单次上限 5000 字符：超长文本预检即跳过（省去必败的 API 调用），直接降级 DeepSeek；
// 不设每日软额度限制，超量由有道 API 自身报错（code≠"0"）后降级。
// QPS 限制 10——高并发时可能频繁降级 DeepSeek，属正常设计。
// 官方语种映射（大模型翻译 llm-trans 支持 40 语种，见 ai.youdao.com/DOCSIRMA/html/trans/api/dmxfy）；
// 映射表覆盖官方全部 ISO 639-1 语种，映射外的源语言按官方 from=auto 由有道服务端自动检测
const YOUDAO_CODES: Record<string, string> = {
  zh: "zh-CHS",
  en: "en",
  ko: "ko",
  ja: "ja",
  fr: "fr",
  ru: "ru",
  es: "es",
  pt: "pt",
  hi: "hi",
  ar: "ar",
  da: "da",
  de: "de",
  fi: "fi",
  it: "it",
  ms: "ms",
  nl: "nl",
  sv: "sv",
  th: "th",
  uk: "uk",
  vi: "vi",
  bs: "bs",
  ca: "ca",
  et: "et",
  hu: "hu",
  id: "id",
  no: "no",
  pl: "pl",
  ro: "ro",
  tr: "tr",
  eo: "eo",
  tl: "tl",
  kk: "kk",
  km: "km",
  my: "my",
  ne: "ne",
  bo: "bo",
  ug: "ug",
};
const YOUDAO_MAX_CHARS = 5000;
const YOUDAO_LLM_ENDPOINT = "https://openapi.youdao.com/proxy/http/llm-trans";
const YOUDAO_LLM_MODEL = "0"; // handleOption: 0=子曰Pro(14B), 3=子曰Lite(1.5B)
const YOUDAO_TIMEOUT_MS = 10_000; // 流式短句翻译，10s 不回即超时降级
const DEEPSEEK_TIMEOUT_MS = 60_000; // high 思考模式 + 合并长文，留足余量

// 官方签名输入规则：q 长度 >20 时取 前10 + 长度 + 后10
function youdaoInput(q: string): string {
  if (q.length <= 20) return q;
  return q.slice(0, 10) + q.length + q.slice(q.length - 10);
}

// 单次 HTTP 请求 + SSE 解析（纯 I/O，不含账号选择逻辑）
async function youdaoRequest(
  text: string,
  from: string,
  to: string,
  appKey: string,
  appSecret: string
): Promise<string> {
  const salt = crypto.randomUUID();
  const curtime = String(Math.round(Date.now() / 1000));
  const sign = crypto
    .createHash("sha256")
    .update(appKey + youdaoInput(text) + salt + curtime + appSecret)
    .digest("hex");
  const prompt = `You are a professional translator. Translate the text COMPLETELY and FULLY.
CRITICAL RULES:
1. Translate EVERY sentence and EVERY detail - do NOT summarize, abbreviate, or omit any content.
2. Keep every placeholder like ⟦T0⟧ ⟦T1⟧ exactly as-is, do not modify, translate, or remove them.
3. Preserve all line breaks and formatting.
4. The output length should be proportional to the input - if input is long, output must be equally long.`;
  const body = new URLSearchParams({
    appKey,
    salt,
    curtime,
    sign,
    signType: "v3",
    i: text,
    from,
    to,
    streamType: "full",
    handleOption: YOUDAO_LLM_MODEL,
    prompt,
  });
  const res = await fetchWithTimeout(YOUDAO_LLM_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  }, YOUDAO_TIMEOUT_MS);
  if (!res.ok) throw new Error(`YOUDAO_LLM_HTTP_${res.status}`);
  // SSE 流式响应（streamType=full）：每行可能带 "data: " 前缀（标准 SSE）或裸 JSON，取最后一条的 data.transFull 为完整译文
  const responseText = await res.text();
  const lines = responseText.split("\n").filter((line) => line.trim());
  let finalTranslation = "";
  let lastErrorCode = "";
  for (const rawLine of lines) {
    // 标准 SSE 格式可能带 "data: " 前缀，剥离后再解析
    const line = rawLine.startsWith("data:") ? rawLine.slice(5).trim() : rawLine.trim();
    if (!line || line === "[DONE]") continue;
    try {
      const parsed = JSON.parse(line);
      if (String(parsed.code) !== "0" || !parsed.successful) {
        lastErrorCode = String(parsed.code || parsed.errorCode || "unknown");
        // 902000（不支持的语言方向）属预期内跨语种拒绝，不打警告；其余错误码保留告警
        if (lastErrorCode !== "902000") {
          const errMsg = parsed.message || "";
          console.warn(`[translate] youdao-llm error: code=${lastErrorCode}, message=${errMsg}`);
        }
        throw new Error(`YOUDAO_LLM_ERROR_${lastErrorCode}`);
      }
      if (parsed.data?.transFull) finalTranslation = parsed.data.transFull;
    } catch (e: any) {
      if (e.message?.startsWith("YOUDAO_LLM_ERROR")) throw e;
      // JSON 解析失败的行跳过（SSE 注释行、空行、event: 前缀等）
    }
  }
  if (!finalTranslation.trim()) {
    console.warn(`[translate] youdao-llm empty response. Raw (first 500 chars): ${responseText.slice(0, 500)}`);
    throw new Error("YOUDAO_LLM_EMPTY");
  }
  return finalTranslation.trim();
}

// 通道1 入口：账号池轮转 + 配额自动切换
// 遍历池中可用账号；某账号返回配额错误码（108/109/110/111）时标记冷却并尝试下一个；
// 全部耗尽或无账号时抛 CHANNEL_SKIPPED，由上层链路降级 DeepSeek。
async function translateViaYoudao(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  const from = YOUDAO_CODES[sourceLang] ?? "auto";
  const to = YOUDAO_CODES[targetLang];
  if (!to) throw new Error("CHANNEL_SKIPPED");
  // 超长预检：有道必拒的请求不发起，立即降级 DeepSeek，省 API 调用与等待
  if (text.length > YOUDAO_MAX_CHARS) throw new Error("CHANNEL_SKIPPED");

  const maxAttempts = youdaoPool.size;
  if (maxAttempts === 0) throw new Error("CHANNEL_SKIPPED");

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const account = youdaoPool.getActive();
    if (!account) throw new Error("CHANNEL_SKIPPED"); // 全部冷却中
    try {
      return await youdaoRequest(text, from, to, account.appKey, account.appSecret);
    } catch (err: any) {
      const code = String(err?.message || "").match(/^YOUDAO_LLM_ERROR_(.+)$/)?.[1] ?? "";
      if (youdaoPool.isQuotaError(code)) {
        // 配额耗尽：标记冷却并轮转到下一个账号
        youdaoPool.markExhausted(account.index);
        continue;
      }
      throw err; // 非配额错误（902000/超时/HTTP 等）直接上抛
    }
  }
  throw new Error("CHANNEL_SKIPPED");
}

// 通道2：DeepSeek V4-Pro（OpenAI 兼容 /chat/completions，思考模式 effort=high）
// 认证需配置 DEEPSEEK_API_KEY；未配置即跳过本通道。作为 LLM 通道插在有道之后：
// 有道对结构化短句快而稳，DeepSeek 对长描述/上下文语义更准，担任中间层。
// 思考模式下 temperature 等参数不生效；思维链走 reasoning_content（此处忽略），译文取 content。
// 占位符沿用链上统一的 ⟦Tn⟧，由 prompt 明确要求原样保留，返回后经 restoreTerms 回填。
// 合并请求模式：标题+正文等多段以 JSON 数组一次进出——一次思考翻完全部字段，
// 段间共享上下文、术语一致，且省去多次深度思考的延迟与 token 开销；
// 返回数组长度/形状不符即判失败。不设单次长度与每日软额度限制，
// 超长/超量由 API 自身报错（HTTP 400/402/429 等）后抛 TRANSLATION_UNAVAILABLE。

async function translateViaDeepSeek(
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
      model: "deepseek-v4-pro",
      messages: [{ role: "user", content: prompt }],
      reasoning_effort: "high",
      thinking: { type: "enabled" },
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

// ── Gemini 3.5-Flash 兜底层 ──────────────────────────────────────────
// 作为第三层兜底，仅在有道 + DeepSeek 均失败时触发。
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
// 统一走有道→DeepSeek→Gemini 三层。有道 llm-trans 官方支持 40 语种（已全部纳入 YOUDAO_CODES 映射），
// 且官方支持 from=auto：本地检测不确定的源语言标 "auto"，由有道服务端自行检测方向；
// DeepSeek 通道对未知源语言省略语言名（LLM 自行识别）；Gemini 作为最终兜底。
// 三通道均失败/未配置时抛 TRANSLATION_UNAVAILABLE，由各调用方既有降级路径处理。
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

  try {
    const translated = new Map<number, string>();
    for (const job of jobs) {
      const { masked, tokens } = protectTerms(job.text);
      translated.set(job.index, restoreTerms(await translateViaYoudao(masked, sourceLang, targetLang), tokens));
    }
    return { translations: assemble(translated), provider: "youdao-llm" };
  } catch (err: any) {
    // 未配置/超长/失败/不支持的语种：落下一通道；
    // 902000（不支持的语言方向）属预期内降级，静默不打日志，其余保留告警
    degraded.push(`youdao-llm:${err?.message}`);
    if (err?.message !== "YOUDAO_LLM_ERROR_902000") {
      console.warn(`[translate] youdao -> next: ${err?.message}`);
    }
  }
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
      provider: "deepseek-v4-pro",
      ...(degraded.length ? { degradedFrom: degraded } : {}),
    };
  } catch (err: any) {
    // 未配置/失败/形状不符：落下一通道
    degraded.push(`deepseek-v4-pro:${err?.message}`);
    console.warn(`[translate] deepseek -> next: ${err?.message}`);
  }
  // 通道3：Gemini 2.5-Flash 兜底
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
  // 三通道均失败/未配置：抛统一错误码，复用既有降级路径（详情 503 / 补翻静默）
  throw new Error("TRANSLATION_UNAVAILABLE");
}
