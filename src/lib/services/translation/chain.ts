/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 公告翻译通道（BYOK：用户自己的大模型 API Key）
 *
 * 2026-11-18 口径调整：在线翻译不再使用平台 DEEPSEEK_API_KEY，改为调用**用户
 * 在「设置 → AI 模型」绑定的 BYOK 配置**（user_llm_config：baseUrl / apiKey / model）。
 * 与 AI 摘要/评分/匹配共用 resolveLlmCredentials；未配置 Key 时由上层报
 * EC_AI_NOT_CONFIGURED（请先配置 LLM API Key），不再有平台 Key 兜底。
 *
 * 通道本身仍是 OpenAI 兼容 /chat/completions（单通道，不做多 provider 级联）：
 *  - 认证走用户 Key；base_url 必须是 HTTPS 公网（SSRF 防护在 fetchWithTimeout 与这里各一层）；
 *  - 合并请求：标题+描述等多段以 JSON 数组一次进出；
 *  - 术语保护：URL/邮箱/参考号/常见缩写先替换 ⟦Tn⟧ 占位符，译后回填，丢失判失败；
 *  - 超时 10s；429/5xx/超时/空响应/坏 JSON/坏形状/占位符丢失按指数退避重试（最多 3 次）；
 *  - 熔断器按「端点+模型」维度隔离：一个用户 Key 持续失败不会熔断其他用户的翻译；
 *  - 失败抛 TRANSLATION_UNAVAILABLE，由上层既有降级路径处理（详情 503 / 补翻静默）。
 */
import { fetchWithTimeout } from "./fetchWithTimeout";

/** 翻译所需的最小凭据形状（resolveLlmCredentials 的返回值可直接传入） */
export interface TranslationCredentials {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export type ChainResult = {
  translations: string[];
  provider: string;
  /** 降级轨迹：上游通道失败时记录 `<provider>:<原因>`，链首成功时缺省 */
  degradedFrom?: string[];
};

/** 翻译链错误：携带降级轨迹信息 */
export class TranslationError extends Error {
  degradedFrom?: string[];
  constructor(message: string, degradedFrom?: string[]) {
    super(message);
    this.name = "TranslationError";
    this.degradedFrom = degradedFrom;
  }
}

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
  /\b(?:UNGM|RFQ|ITB|EOI|ISO|FDA|CE|GMP|RoHS|3C)\b/g,
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

const DEEPSEEK_TIMEOUT_MS = 10_000; // 用户配置的模型通常 <2s 返回；10s 覆盖慢响应+CDN 挂死
const TRANSLATE_MAX_RETRIES = 3;       // 429/5xx 最多重试 3 次（共 4 次尝试）
const TRANSLATE_RETRY_BASE_MS = 1_500; // 重试基础间隔 1.5s，指数退避：1.5s → 3s → 6s

// ── 熔断器：按「端点 + 模型」隔离 ──
// BYOK 下每个用户 Key 独立计费/限流，一个用户的 Key 失效不能熔断全站翻译；
// 连续 N 次 503/超时/确定性错误后暂停该凭据通道，避免持续浪费请求。
const CIRCUIT_THRESHOLD = 3;       // 连续 3 次失败触发熔断
const CIRCUIT_COOLDOWN_MS = 60_000; // 熔断冷却 60 秒

interface CircuitState {
  consecutiveFailures: number;
  trippedAt: number;
}

const circuits = new Map<string, CircuitState>();

/** 熔断维度：同一端点+模型的用户共享一个熔断状态（同 Key 失败会一起冷却，符合预期） */
function circuitKey(creds: TranslationCredentials): string {
  const baseUrl = creds.baseUrl.replace(/\/+$/, "");
  return `${baseUrl}|${creds.model}`;
}

function circuitBreakerAllow(key: string): boolean {
  const state = circuits.get(key);
  if (!state || state.trippedAt === 0) return true;
  if (Date.now() - state.trippedAt >= CIRCUIT_COOLDOWN_MS) {
    // 冷却期结束，重置熔断器（半开状态允许一次请求试探恢复）
    circuits.delete(key);
    console.warn("[translate] byok circuit breaker: cooldown elapsed, retrying");
    return true;
  }
  return false;
}

function circuitBreakerRecordSuccess(key: string) {
  circuits.delete(key);
}

function circuitBreakerRecordFailure(key: string) {
  const state = circuits.get(key) ?? { consecutiveFailures: 0, trippedAt: 0 };
  state.consecutiveFailures += 1;
  if (state.consecutiveFailures >= CIRCUIT_THRESHOLD && state.trippedAt === 0) {
    state.trippedAt = Date.now();
    console.warn(
      `[translate] byok circuit breaker: TRIPPED after ${state.consecutiveFailures} consecutive failures, cooldown ${CIRCUIT_COOLDOWN_MS / 1000}s`,
    );
  }
  circuits.set(key, state);
}

/** 供上层（如批量补翻）查询某凭据是否处于熔断打开状态 */
export function isDeepSeekCircuitBreakerOpen(creds?: TranslationCredentials): boolean {
  if (!creds) return false;
  const state = circuits.get(circuitKey(creds));
  return !!state && state.trippedAt !== 0 && Date.now() - state.trippedAt < CIRCUIT_COOLDOWN_MS;
}

// 判断翻译通道错误是否可重试（429 限流 / 5xx 服务端错误 / 超时 / 空响应 / 占位符丢失 / 格式异常）
// TRANSLATE_EMPTY：模型偶发返回空内容，通常为瞬时异常，重试成功率高
// TRANSLATE_BAD_SHAPE / TRANSLATE_BAD_JSON：模型偶发返回非预期数组结构或非法 JSON
// MT_PLACEHOLDER_LOST：模型偶发破坏占位符，重试通常可恢复
function isRetryable(errMsg: string): boolean {
  return /TRANSLATE_HTTP_(429|500|502|503|504)/.test(errMsg) ||
    errMsg === "CHANNEL_TIMEOUT" ||
    errMsg === "TRANSLATE_EMPTY" ||
    errMsg === "TRANSLATE_BAD_SHAPE" ||
    errMsg === "TRANSLATE_BAD_JSON" ||
    errMsg === "MT_PLACEHOLDER_LOST";
}

// BYOK 单次翻译（无重试）：被 translateViaCreds 包装调用
async function translateOnce(
  texts: string[],
  sourceLang: string,
  targetLang: string,
  creds: TranslationCredentials,
): Promise<string[]> {
  const apiKey = String(creds.apiKey ?? "").trim();
  const baseUrl = String(creds.baseUrl ?? "").replace(/\/+$/, "");
  const model = String(creds.model ?? "").trim();
  // 源语言映射缺失不再跳过：LLM 通道无需显式源语言（模型自行识别）
  const targetName = CHAIN_LANG_NAMES[targetLang];
  if (!apiKey || !baseUrl || !model || !targetName) throw new Error("CHANNEL_SKIPPED");
  // env/用户配置的出站地址 fail-fast 校验：仅允许 https 公网主机（拒绝环回/私有/保留段）
  if (
    !/^https:\/\/(?!localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)[a-zA-Z0-9.-]+(:\d+)?/.test(
      baseUrl,
    )
  ) {
    throw new Error("CHANNEL_URL_BLOCKED");
  }
  void sourceLang; // 保留入参以便将来在 prompt 中显式声明；当前由模型自识别
  const prompt = `You are a procurement text translator. Translate each text below into ${targetName}.
Rules:
- Preserve ⟦Tn⟧ placeholders exactly as-is
- Use consistent procurement terminology
- Output ONLY a JSON array of ${texts.length} strings, no explanation, no markdown
- Each array element must be the translation of the corresponding input element

Input: ${JSON.stringify(texts)}

Output (JSON array[${texts.length}]):`;
  const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      // 用户配置的模型未必支持 thinking 字段；只在明确是 DeepSeek 模型时关闭思考，
      // 其它 OpenAI 兼容端点（gpt/glm/qwen 等）不认识该字段，带上可能直接 400。
      ...(/deepseek/i.test(model) ? { thinking: { type: "disabled" } } : {}),
    }),
  }, DEEPSEEK_TIMEOUT_MS);
  if (!res.ok) throw new Error(`TRANSLATE_HTTP_${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = String(data?.choices?.[0]?.message?.content ?? "").trim();
  if (!content) throw new Error("TRANSLATE_EMPTY");
  // 容错提取 JSON 数组：先剥 markdown 围栏，再尝试从混合文本中定位 [...]
  const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // 模型可能在 JSON 前后附加解释文字，尝试提取第一个完整的 JSON 数组
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        parsed = JSON.parse(arrMatch[0]);
      } catch {
        throw new Error("TRANSLATE_BAD_JSON");
      }
    } else {
      throw new Error("TRANSLATE_BAD_JSON");
    }
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== texts.length ||
    !parsed.every((item) => typeof item === "string" && item.trim() !== "")
  ) {
    throw new Error("TRANSLATE_BAD_SHAPE");
  }
  return (parsed as string[]).map((item) => item.trim());
}

// 带重试 + 熔断的包装：429/5xx/超时自动指数退避重试，其余错误立即抛出
async function translateViaCreds(
  texts: string[],
  sourceLang: string,
  targetLang: string,
  creds: TranslationCredentials,
): Promise<string[]> {
  const key = circuitKey(creds);
  // 熔断器激活时直接跳过，不浪费请求
  if (!circuitBreakerAllow(key)) {
    throw new Error("TRANSLATE_CIRCUIT_BREAKER_OPEN");
  }
  let lastErr: unknown;
  for (let attempt = 0; attempt <= TRANSLATE_MAX_RETRIES; attempt++) {
    try {
      const result = await translateOnce(texts, sourceLang, targetLang, creds);
      circuitBreakerRecordSuccess(key);
      return result;
    } catch (err: unknown) {
      lastErr = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      if (attempt < TRANSLATE_MAX_RETRIES && isRetryable(errMsg)) {
        const delayMs = TRANSLATE_RETRY_BASE_MS * Math.pow(2, attempt);
        console.warn(`[translate] byok retry ${attempt + 1}/${TRANSLATE_MAX_RETRIES} after ${delayMs}ms: ${errMsg}`);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      // 不可重试或重试耗尽：记录熔断器（所有错误均计入，含 401 等确定性失败）
      circuitBreakerRecordFailure(key);
      throw err;
    }
  }
  throw lastErr;
}

// 通道入口：空文本原样透传（供应商空字段等）；目标含六语言（zh/en/fr/ru/es/ar）
// 使用用户 BYOK 凭据（单通道）。凭据缺失时由上层（resolveLlmCredentials）先报未配置。
export type ChainSourceLang =
  | "en" | "zh" | "ru" | "ar" | "fr" | "es" | "pt" | "de" | "it"
  | "nl" | "pl" | "ro" | "sv" | "da" | "fi" | "no" | "hu" | "tr" | "et"
  | "ca" | "id" | "ms" | "vi" | "tl" | "uk"
  | "auto";

export async function translateViaChain(
  texts: string[],
  sourceLang: ChainSourceLang,
  targetLang: string,
  creds: TranslationCredentials,
): Promise<ChainResult> {
  const jobs = texts
    .map((text, index) => ({ text, index }))
    .filter((job) => job.text.trim() !== "");
  if (jobs.length === 0) return { translations: texts, provider: "none" };

  const assemble = (translated: Map<number, string>): string[] =>
    texts.map((text, index) => translated.get(index) ?? text);

  // ── 用户 BYOK 单通道 ──
  try {
    // 合并请求：所有段一次过模型（各段独立 protectTerms，占位符互不干扰）
    const masks = jobs.map((job) => protectTerms(job.text));
    const outputs = await translateViaCreds(
      masks.map((m) => m.masked),
      sourceLang,
      targetLang,
      creds,
    );
    const translated = new Map<number, string>();
    jobs.forEach((job, i) => {
      translated.set(job.index, restoreTerms(outputs[i], masks[i].tokens));
    });
    const provider = String(creds.model || "").trim() || "byok";
    return {
      translations: assemble(translated),
      provider,
    };
  } catch (err: unknown) {
    // 用户凭据失败：抛统一错误码，复用既有降级路径（详情 503 / 补翻静默）
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[translate] byok unavailable: ${errMsg}`);
    throw new TranslationError("TRANSLATION_UNAVAILABLE", [`${creds.model || "byok"}:${errMsg}`]);
  }
}
