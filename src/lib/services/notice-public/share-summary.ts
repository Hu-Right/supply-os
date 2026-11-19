/**
 * 分享卡摘要（中文 / 英文）— 纯函数
 * @module lib/services/notice-public/share-summary
 *
 * @description 分享卡（OG 图）、分享文案、列表 teaser 共用同一段摘要：
 *             从标题 + 正文中取 1–2 句可读文本，去掉标签前缀、列表编号、URL/邮箱等噪声。
 *             规则（与设计稿对齐）：
 *              - 中文 ≤ 90 字、英文 ≤ 180 字符，最多两句；
 *              - 跳过「采购描述（详细版）：」这类标签行与纯列表项；
 *              - 引导句以冒号结尾且后接清单时，拼前 2 项 + 「等」；
 *              - 超长句子跳过、改取下一句完整句（不硬截断到半句）；
 *              - 抽不出可用文字时返回 null，由调用方回退标题（不硬造句子）。
 *
 *             生成时机：notice_public 构建（build.ts）时写入 share_summary /
 *             share_summary_en；历史行为空时读侧可用同一函数实时回退。
 */

export interface ShareSummaryInput {
  title?: string | null;
  titleCn?: string | null;
  description?: string | null;
  descriptionCn?: string | null;
}

export interface ShareSummary {
  zh: string | null;
  en: string | null;
}

export const SHARE_SUMMARY_MAX_ZH = 90;
export const SHARE_SUMMARY_MAX_EN = 180;

/**
 * 正文只在开头找摘要：源正文最大可到 MB 级（longtext），全量切句会让构建期 CPU 爆掉。
 * 中文取前 4000 字、英文前 6000 字符，足够覆盖前 1–2 句。
 */
const ZH_INPUT_LIMIT = 4000;
const EN_INPUT_LIMIT = 6000;

/** 标签式前缀：「采购描述（详细版）：」「Tender Notice (TN)」「INVITATION FOR BIDS:」等 */
const HEADER_PATTERNS: RegExp[] = [
  /^(?:采购描述(?:（详细版）)?|项目描述|项目概况|采购内容|采购说明|招标描述|公告描述)\s*[:：]\s*/,
  /^(?:Description|Summary|Overview)\s*[:：]\s*/i,
  /^Tender Notice(?:\s*\([^)]*\))?\s*/i,
  /^(?:Contract|Contract Award|Prior Information)\s+Notice(?:\s*\([^)]*\))?\s*/i,
  /^INVITATION FOR BIDS(?:\s*\([^)]*\))?\s*/i,
  /^INVITATION TO BID(?:\s*\([^)]*\))?\s*/i,
  /^TITLE OF TENDER\s*[:：]\s*/i,
  /^Tender title\s*[:：]\s*/i,
];

/** 纯噪声行：URL、邮箱、只有编号/日期/文号 */
const NOISE_LINE = /^(?:https?:\/\/|www\.)|^[\w.+-]+@[\w-]+\.[\w.]+$|^[A-Z0-9/\-_. ]{1,40}$/;

/** 序列项标记：- • · * 1. 1) 1、 */
const LIST_MARK = /^(?:[-•·*]\s+|\d{1,2}[.)、]\s*)/;

/** 清单项尾部的数量/规格：「——1台」「——2 套」 */
const ITEM_QTY = /[—–-]{1,2}\s*\d+\s*(?:台|套|个|件|张|批|份|组|把|支|项|辆|台套)\s*$/;

function cleanText(raw: string): string {
  return raw
    .replace(/\r/g, "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, " ")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 反复剥离开头的标签/抬头（"Tender Notice (TN) INVITATION FOR BIDS (IFB) TITLE OF TENDER:" 这类堆叠） */
function stripHeaders(text: string): string {
  let current = text.trim();
  for (;;) {
    const before = current;
    for (const re of HEADER_PATTERNS) current = current.replace(re, "").trim();
    if (current === before) return current;
  }
}

/** 按行切分后再按句末标点切句（保留标点，便于判断引导句） */
function toUnits(text: string): string[] {
  const units: string[] = [];
  for (const line of text.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    for (const part of trimmed.split(/(?<=[。！？!?])\s*|(?<=\.)\s+(?=[A-Z"“])/)) {
      const unit = part.trim();
      if (unit) units.push(unit);
    }
  }
  return units;
}

function stripListMark(text: string): string {
  return text.replace(LIST_MARK, "").trim();
}

function isLeadIn(text: string): boolean {
  return /[：:]$/.test(text);
}

function isSentenceEnd(text: string): boolean {
  return /[。！？!?]$/.test(text);
}

/** 在标点处截断并补省略号（避免把词/数字切断） */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const at = Math.max(
    cut.lastIndexOf("。"),
    cut.lastIndexOf("；"),
    cut.lastIndexOf("，"),
    cut.lastIndexOf("、"),
    cut.lastIndexOf("："),
    cut.lastIndexOf(" "),
  );
  const body = at >= Math.floor(max * 0.55) ? cut.slice(0, at) : cut;
  return `${body.replace(/[，、；：\s]+$/, "")}…`;
}

/** 清单项清洗：去编号、去尾部数量、去句末标点 */
function cleanItem(text: string): string {
  return stripListMark(text).replace(ITEM_QTY, "").replace(/[。；;]+$/, "").trim();
}

/**
 * 从正文抽摘要：优先「能完整放下的第一句」；引导句（冒号结尾）拼前两个清单项。
 * @param units 已切好的行/句
 * @param max 长度上限
 * @param minChars 太短的句子不单独成摘（会继续找下一句）
 * @param joiner 两句拼接符（中文空串、英文空格）
 */
function extract(units: string[], max: number, minChars: number, joiner: string): string | null {
  let fallback: string | null = null;

  for (let i = 0; i < units.length; i += 1) {
    const raw = units[i];
    if (NOISE_LINE.test(raw)) continue;
    const text = stripHeaders(stripListMark(raw)).trim();
    if (text.length < minChars || NOISE_LINE.test(text)) continue;

    // 引导句 + 清单：取前两项，收尾「等」
    if (isLeadIn(text)) {
      const items: string[] = [];
      for (let j = i + 1; j < units.length && items.length < 2; j += 1) {
        const item = cleanItem(units[j]);
        if (!item || NOISE_LINE.test(item)) continue;
        if (isSentenceEnd(item)) break; // 清单结束
        items.push(item);
      }
      if (items.length > 0) {
        const combined = `${text}${items.join("、")}等`;
        if (combined.length <= max) return combined;
        fallback ??= truncate(combined, max);
        continue;
      }
      continue;
    }

    // 普通句子：太短则顺延一句，凑够可读长度
    let sentence = text;
    let j = i + 1;
    while (sentence.length < Math.floor(max * 0.45) && j < units.length) {
      const next = stripHeaders(stripListMark(units[j])).trim();
      if (!next || NOISE_LINE.test(next) || isLeadIn(next) || !isSentenceEnd(sentence)) break;
      if (sentence.length + next.length + joiner.length > max) break;
      sentence = `${sentence}${joiner}${next}`;
      j += 1;
    }
    if (sentence.length > max) {
      fallback ??= truncate(sentence, max);
      continue;
    }
    return sentence;
  }

  return fallback;
}

/** 生成中英分享摘要；抽不出内容时返回 null（调用方回退标题） */
export function buildShareSummary(input: ShareSummaryInput): ShareSummary {
  const descCn = String(input.descriptionCn ?? "").trim().slice(0, ZH_INPUT_LIMIT);
  const descEn = String(input.description ?? "").trim().slice(0, EN_INPUT_LIMIT);

  const zh = descCn ? extract(toUnits(cleanText(descCn)), SHARE_SUMMARY_MAX_ZH, 12, "") : null;
  const en = descEn ? extract(toUnits(cleanText(descEn)), SHARE_SUMMARY_MAX_EN, 24, " ") : null;

  return { zh, en };
}
