/**
 * 公告日期严格解析器（纯函数，唯一实现）
 *
 * 背景：crm_bid_notices.published_date 是源库自由文本。Phase 0/68 探针实测活跃人群形态：
 *   - ISO：`YYYY-MM-DD`，可带 `T`/空格 + 时刻；时刻绝大多数是午夜默认 `00:00`/`00:00:00`，
 *          或带时区尾巴如 `(UTC+02:00)`/`(UTC+1200)`/`Z`（共 ~5.76 万条）
 *   - 英文：`D-Mon-YYYY`（Mon 标准英文三字母），可带 ` 12:00 AM` 等
 *   - 其余「不可解析」为 0 条
 * 解析规则（对齐已锁定的「统一 UTC / 不臆造」口径）：
 *   1) 忽略尾部时区标注，按墙上日历时间取值（源以展示为准，不做偏移换算）
 *   2) 午夜默认（00:00 / 00:00:00 / 12:00 AM）视为「无真实时刻」→ hasTime=false，上层只显日期
 *   3) 非午夜的真实时刻 → hasTime=true，上层显示 HH:mm
 *   4) 识别不了的一律返回 null（不猜、不硬造），上层显示「未公布」
 *
 * 归属：纯工具、零服务端依赖，落 `@/shared`（红线 3：features 不得 import `@/lib`）。
 */

/** 标准英文三字母月份；与 notice-deadline/classify.ts 的 MONTHS 保持同口径 */
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export interface ParsedDate {
  /** UTC 秒时间戳 */
  ts: number;
  /** 是否为「非午夜默认」的真实时刻；纯日期/午夜默认 → false（上层据此决定是否显示 HH:mm） */
  hasTime: boolean;
}

/** 去掉时间串尾部的时区标注：`(UTC+02:00)` / `(GMT 3.00)` / `UTC+02` / `Z` / `+02:00` / `+0200` */
function stripTz(s: string): string {
  return s
    .replace(/\s*\(\s*(?:UTC|GMT|UT|TZ)\b[^)]*\)\s*$/i, "")
    .replace(/\s*(?:UTC|GMT|UT|Z)\b\s*(?:[+-]\d{1,2}(?::?\d{2})?)?\s*$/i, "")
    .replace(/\s*[+-]\d{1,2}:?\d{2}\s*$/, "")
    .trim();
}

/** 解析时间核心串（已去时区）；非法返回 undefined，空串返回 null（表示无时刻） */
function parseTimeCore(timeStr: string): { h: number; m: number; s: number } | null | undefined {
  if (timeStr === "") return null; // 纯日期
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/i.exec(timeStr);
  if (!m) return undefined; // 不是合法时刻 → 不猜
  let h = Number(m[1]);
  const min = Number(m[2]);
  const sec = m[3] ? Number(m[3]) : 0;
  const mer = m[4]?.toUpperCase();
  if (min > 59 || sec > 59) return undefined;
  if (mer) {
    if (h < 1 || h > 12) return undefined;
    h = mer === "AM" ? (h === 12 ? 0 : h) : h === 12 ? 12 : h + 12;
  } else if (h > 23) {
    return undefined;
  }
  return { h, m: min, s: sec };
}

/** 从日期核心之后的剩余串得出时刻；返回 undefined 表示「无法识别」应判 null */
function resolveTime(remainder: string): { time: { h: number; m: number; s: number } | null } | undefined {
  const timeStr = stripTz(remainder.replace(/^[T\s]+/i, ""));
  const core = parseTimeCore(timeStr);
  if (core === undefined) return undefined;
  return { time: core };
}

function build(y: number, mo: number, d: number, t: { h: number; m: number; s: number } | null): number {
  return Math.floor(Date.UTC(y, mo - 1, d, t?.h ?? 0, t?.m ?? 0, t?.s ?? 0) / 1000);
}

/** 午夜默认（00:00:00）视为无真实时刻 */
function isMidnight(t: { h: number; m: number; s: number } | null): boolean {
  return !t || (t.h === 0 && t.m === 0 && t.s === 0);
}

/**
 * 严格解析发布日期原文为 UTC 时间戳。
 * @returns 成功返回 { ts, hasTime }；空/不可识别返回 null（不臆造）。
 */
export function parseNoticeDate(raw: string | null | undefined): ParsedDate | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  // ISO：YYYY-MM-DD，后面可有 T/空格 + 时刻 + 时区
  let m = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const r = resolveTime(m[4]);
    if (!r) return null;
    return { ts: build(y, mo, d, r.time), hasTime: !isMidnight(r.time) };
  }

  // 英文：D-Mon-YYYY，后面可有空格 + 时刻 + 时区
  m = /^(\d{1,2})-([A-Za-z]{3,9})-(\d{4})(.*)$/.exec(s);
  if (m) {
    const d = Number(m[1]);
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    const y = Number(m[3]);
    if (!mo || d < 1 || d > 31) return null;
    const r = resolveTime(m[4]);
    if (!r) return null;
    return { ts: build(y, mo, d, r.time), hasTime: !isMidnight(r.time) };
  }

  return null;
}
