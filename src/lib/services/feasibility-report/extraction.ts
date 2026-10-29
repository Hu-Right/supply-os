/**
 * 投标可行性报告 —— 要求项抽取（LLM + 严格 schema 校验）
 *
 * @module lib/services/feasibility-report/extraction
 * @description 把公告文本（+已有拆解字段）交给 BYOK 大模型抽取成结构化「要求项」。
 *              硬约束：
 *              - 只接受 JSON 数组；每条必须带 `source.quote`（抽不到原文的项直接丢弃，
 *                不允许进 mandatory 结论）；
 *              - 枚举/长度/数量上限在本地校验（不信任模型输出）；
 *              - LLM 调用可注入（测试不触网）。
 *              真实调用见 `callLlmForExtraction`（复用 现有 fetchWithTimeout + BYOK 凭证）。
 */
import { fetchWithTimeout } from "../translation/fetchWithTimeout";
import type { LlmCredentials } from "../ai-score/llm-client";
import { DEFAULT_SUMMARY_TIMEOUT_MS } from "../ai-summary/llm-profile";
import {
  IMPORTANCE_LEVELS,
  REQUIREMENT_TYPES,
  type Importance,
  type RequirementItem,
  type RequirementType,
} from "./types";

/** 公告 → 抽取输入（与 DB 行解耦，便于测试与复用） */
export interface NoticeExtractionInput {
  noticePk: number;
  title: string;
  description: string;
  /** 中文描述（若有，优先给模型） */
  descriptionCn?: string | null;
  countryCode?: string | null;
  noticeType?: string | null;
  agency?: string | null;
  deadlineIso?: string | null;
  attachments?: Array<{ name: string; url?: string | null }>;
  /** 已有拆解字段（bid_opportunities） */
  opportunity?: {
    eligibility?: string | null;
    technicalHurdles?: string | null;
    supplierConditions?: string | null;
    bidOverview?: string | null;
  } | null;
}

/** 单次抽取最多接受的要求项（防模型刷屏） */
export const MAX_REQUIREMENT_ITEMS = 60;
/** 单条 rawText/quote 上限 */
const MAX_TEXT = 500;

export const EXTRACTION_SYSTEM_PROMPT = [
  "你是资深国际招投标顾问，负责从招标公告中抽取【投标要求项】。",
  "只输出 JSON 数组，不要任何解释、不要 markdown 代码块。",
  "数组元素字段：",
  '- type: 枚举之一 ["certification","experience","financial","personnel","localization","registration","technical","commercial","delivery","submission","bond","language","warranty","other"]',
  '- importance: "mandatory"（不满足即废标）/ "scored"（评分项）/ "preferred"（加分或参考）',
  "- title: 中文业务标题，≤60 字",
  "- value: 尽量结构化的对象：",
  "    certification: {code, issuer?}；experience: {count?, years?, similarScope?}；",
  "    financial: {metric, value, year?, currency?, operator?}；technical: {parameter, value, unit?, operator?}；",
  "    delivery: {days}；warranty: {years}；registration: {platform}；language: {language}；",
  "    localization: {requires: [\"hasLocalOffice\"|\"hasLocalAgent\"|\"hasLocalTaxId\"]}；",
  "    submission: {items: [...]}；bond: {amount?, currency?, ratio?}",
  "- rawText: 对应原文片段（≤300 字，必须逐字来自公告，不得改写/翻译/概括）",
  "- source: {kind: \"notice_text\"|\"attachment\"|\"opportunity_field\", ref?: 附件名或字段名, quote: 与 rawText 一致的原文片段}",
  "规则：",
  "1) 每条必须能在原文中找到依据（source.quote），找不到依据的要求不要输出；",
  "2) 不确定 importance 时用 scored，不要臆断 mandatory；",
  "3) 不要编造数字、日期、机构；原文没有的信息用 ? 省略，不要猜测；",
  "4) 最多输出 40 条；同类要求合并，不要重复。",
].join("\n");

/** 构建用户消息（公告正文 + 已有拆解字段 + 附件清单） */
export function buildExtractionUserPrompt(input: NoticeExtractionInput): string {
  const parts: string[] = [];
  parts.push(`公告编号：${input.noticePk}`);
  if (input.title) parts.push(`标题：${input.title}`);
  if (input.countryCode) parts.push(`国家/地区：${input.countryCode}`);
  if (input.noticeType) parts.push(`公告类型：${input.noticeType}`);
  if (input.agency) parts.push(`采购方：${input.agency}`);
  if (input.deadlineIso) parts.push(`投标截止：${input.deadlineIso}`);
  if (input.descriptionCn?.trim()) parts.push(`中文描述：\n${input.descriptionCn.trim()}`);
  if (input.description?.trim()) parts.push(`原文描述：\n${input.description.trim()}`);
  const opp = input.opportunity;
  if (opp) {
    if (opp.eligibility?.trim()) parts.push(`资格条件（已有拆解）：\n${opp.eligibility.trim()}`);
    if (opp.technicalHurdles?.trim()) parts.push(`技术要求（已有拆解）：\n${opp.technicalHurdles.trim()}`);
    if (opp.supplierConditions?.trim()) parts.push(`供应商条件（已有拆解）：\n${opp.supplierConditions.trim()}`);
    if (opp.bidOverview?.trim()) parts.push(`投标概况（已有拆解）：\n${opp.bidOverview.trim()}`);
  }
  if (input.attachments?.length) {
    parts.push(`附件清单：${input.attachments.map((a) => a.name).join("、")}`);
  }
  parts.push("请按要求输出 JSON 数组。");
  return parts.join("\n\n");
}

// ── 解析与校验 ────────────────────────────────────────────────────────

export interface ParseExtractionOptions {
  /** 注入当前时间，便于测试稳定 */
  now?: string;
  /** 抽取模型名（写入 extraction.model） */
  model?: string | null;
  promptVersion?: string | null;
}

export interface ParseExtractionResult {
  items: RequirementItem[];
  /** 被丢弃/修正的条目说明，便于日志与评估 */
  issues: string[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** 从模型输出中提取 JSON 数组（容忍 ```json 代码块与前后说明文字） */
function extractJsonArray(content: string): unknown {
  const cleaned = content
    .replace(/^[\s\S]*?(?=\[)/, "") // 去掉数组之前的文本
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/\s*```$/g, "")
    .trim();
  const candidates = [cleaned];
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (match) candidates.push(match[0]);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // 继续尝试
    }
  }
  throw new Error("LLM_BAD_JSON");
}

const normalizeType = (raw: unknown): RequirementType | null => {
  const v = String(raw ?? "").trim().toLowerCase();
  return (REQUIREMENT_TYPES as readonly string[]).includes(v) ? (v as RequirementType) : null;
};

const normalizeImportance = (raw: unknown): Importance => {
  const v = String(raw ?? "").trim().toLowerCase();
  return (IMPORTANCE_LEVELS as readonly string[]).includes(v) ? (v as Importance) : "scored";
};

const trimText = (raw: unknown, max: number): string => String(raw ?? "").trim().slice(0, max);

/**
 * 校验并规范化模型输出。
 * 关键纪律：没有原文 quote 的条目直接丢弃；invalid enum/空 title 丢弃并记录 issue。
 */
export function parseExtractionResponse(
  content: string,
  noticePk: number,
  opts: ParseExtractionOptions = {},
): ParseExtractionResult {
  const now = opts.now ?? new Date().toISOString();
  const issues: string[] = [];
  const parsed = extractJsonArray(content);
  if (!Array.isArray(parsed)) throw new Error("LLM_BAD_SHAPE");
  // 数组里没有任何对象 → 视为模型输出形状错误（不静默产出空报告）
  if (parsed.length > 0 && parsed.every((item) => !isRecord(item))) throw new Error("LLM_BAD_SHAPE");

  const seen = new Set<string>();
  const items: RequirementItem[] = [];
  for (const [index, raw] of parsed.entries()) {
    if (items.length >= MAX_REQUIREMENT_ITEMS) {
      issues.push(`超过上限 ${MAX_REQUIREMENT_ITEMS} 条，已截断`);
      break;
    }
    if (!isRecord(raw)) {
      issues.push(`#${index}: 非对象，已丢弃`);
      continue;
    }
    const type = normalizeType(raw.type);
    if (!type) {
      issues.push(`#${index}: type 非法（${String(raw.type)}），已丢弃`);
      continue;
    }
    const title = trimText(raw.title, 60);
    if (!title) {
      issues.push(`#${index}: title 为空，已丢弃`);
      continue;
    }
    const source = isRecord(raw.source) ? raw.source : null;
    const quote = trimText(source?.quote ?? raw.quote ?? raw.rawText, MAX_TEXT);
    if (!quote) {
      issues.push(`#${index}（${type}）: 缺少原文 quote，已丢弃（无证据不结论）`);
      continue;
    }
    const rawText = trimText(raw.rawText ?? quote, MAX_TEXT) || quote;
    // 去重：同类型 + 同标题 + 同 quote 片段
    const dedupeKey = `${type}|${title}|${quote.slice(0, 80)}`;
    if (seen.has(dedupeKey)) {
      issues.push(`#${index}（${type}）: 重复项，已丢弃`);
      continue;
    }
    seen.add(dedupeKey);

    const kindRaw = String(source?.kind ?? "").trim();
    const kind = kindRaw === "attachment" || kindRaw === "opportunity_field" || kindRaw === "notice_text"
      ? kindRaw
      : "notice_text";

    const seq = items.length + 1;
    items.push({
      id: `req-${seq}`,
      noticePk,
      seq,
      type,
      importance: normalizeImportance(raw.importance),
      title,
      value: isRecord(raw.value) ? raw.value : null,
      rawText,
      source: {
        kind,
        ref: source?.ref == null ? null : String(source.ref).slice(0, 200),
        locator: isRecord(source?.locator) ? (source.locator as RequirementItem["source"]["locator"]) : null,
        quote,
        capturedAt: now,
      },
      extraction: {
        method: "llm",
        model: opts.model ?? null,
        promptVersion: opts.promptVersion ?? null,
        confidence: 0.8,
      },
    });
  }
  return { items, issues };
}

// ── 调用（BYOK，可注入） ──────────────────────────────────────────────

export type LlmCall = (systemPrompt: string, userPrompt: string) => Promise<string>;

/** 实际 LLM 调用：OpenAI 兼容端点，超时/温度按凭证档位适配 */
export function callLlmForExtraction(creds: LlmCredentials): LlmCall {
  return async (systemPrompt, userPrompt) => {
    const baseUrl = creds.baseUrl.replace(/\/+$/, "");
    const payload: Record<string, unknown> = {
      model: creds.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: false,
    };
    if (creds.supportsTemperature !== false) payload.temperature = 0;
    const res = await fetchWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${creds.apiKey}`,
        },
        body: JSON.stringify(payload),
      },
      creds.summaryTimeoutMs ?? DEFAULT_SUMMARY_TIMEOUT_MS,
    );
    if (!res.ok) throw new Error(`LLM_HTTP_${res.status}`);
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = String(body?.choices?.[0]?.message?.content ?? "").trim();
    if (!content) throw new Error("LLM_EMPTY");
    return content;
  };
}

export interface ExtractRequirementsOptions {
  llm: LlmCall;
  /** 模型名（写入抽取记录） */
  model?: string | null;
  promptVersion?: string;
  now?: string;
}

/** 编排：构建 prompt → 调 LLM → 解析校验 */
export async function extractRequirements(
  input: NoticeExtractionInput,
  opts: ExtractRequirementsOptions,
): Promise<ParseExtractionResult & { model: string | null }> {
  const raw = await opts.llm(EXTRACTION_SYSTEM_PROMPT, buildExtractionUserPrompt(input));
  const result = parseExtractionResponse(raw, input.noticePk, {
    now: opts.now,
    model: opts.model ?? null,
    promptVersion: opts.promptVersion ?? "feas-req-v0.1",
  });
  return { ...result, model: opts.model ?? null };
}
