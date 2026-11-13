/**
 * 公告日期严格解析器（纯函数）——2026-11-13 收敛为统一识别器之上的**策略层**
 *
 * 背景：bid_notices.published_date 是源库自由文本。Phase 0/68 探针实测活跃人群形态：
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
 * 识别本身在 `source-date.ts`（全仓唯一实现）；本文件只保留 display 口径：
 * 残尾必须吃完、认 AM/PM、D-Mon 只认连字符（旧契约，金样钉住）。
 *
 * 归属：纯工具、零服务端依赖，落 `@/shared`（红线 3：features 不得 import `@/lib`）。
 */
import {
  parseSourceDateParts,
  sourceDateWallSeconds,
  SOURCE_DATE_PROFILES,
} from "./source-date";

export interface ParsedDate {
  /** UTC 秒时间戳 */
  ts: number;
  /** 是否为「非午夜默认」的真实时刻；纯日期/午夜默认 → false（上层据此决定是否显示 HH:mm） */
  hasTime: boolean;
}

/** 午夜默认（00:00:00）视为无真实时刻 */
function isMidnight(p: { h: number | null; mi: number; s: number }): boolean {
  return p.h == null || (p.h === 0 && p.mi === 0 && p.s === 0);
}

/**
 * 严格解析发布日期原文为 UTC 时间戳。
 * @returns 成功返回 { ts, hasTime }；空/不可识别返回 null（不臆造）。
 */
export function parseNoticeDate(raw: string | null | undefined): ParsedDate | null {
  const parts = parseSourceDateParts(raw, SOURCE_DATE_PROFILES.display);
  if (!parts) return null;
  return { ts: sourceDateWallSeconds(parts), hasTime: !isMidnight(parts) };
}
