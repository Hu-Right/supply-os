/**
 * Unix 时间戳归一化工具 — 秒/毫秒判定的唯一事实源
 * Unix Timestamp Normalization — single source of truth for sec/ms discrimination
 *
 * @module shared/utils/unixTs
 * @description 历史代码中秒/毫秒判别谓词存在两种写法（`ts < 1e12 → ×1000` 与
 *              `ts > 1e12 ? ts : ts×1000`），在边界值 1e12 上语义相反。本模块统一为
 *              `< 1e12 → ×1000`：1e12 毫秒 = 2001-09-09（合理的历史截止日），
 *              1e12 秒 = 公元 33658 年（不可能值），边界值归毫秒更安全。
 *              同时提供 CST 日历剩余天数计算，与 formatDeadlineZh 的
 *              "今天/明天/后天" 标签口径对齐（避免"明天 + 剩余 2 天"的矛盾组合）。
 */

/** 秒/毫秒判别阈值：小于 1e12 视为秒级（当前秒级约 1.77e9），否则视为毫秒级（当前毫秒级约 1.77e12） */
const MS_BOUNDARY = 1e12;

/** CST (UTC+8) 时区偏移（毫秒） */
const CST_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * 将秒级或毫秒级 Unix 时间戳归一化为毫秒。
 * @returns 毫秒时间戳；null/空串/非数值输入返回 NaN；0 原样返回 0（无截止日期哨兵值，由调用方处理）
 */
export function toUnixMs(ts: number | string | null | undefined): number {
  if (ts == null || ts === "") return NaN;
  const n = typeof ts === "number" ? ts : Number(ts);
  if (!Number.isFinite(n)) return NaN;
  return n < MS_BOUNDARY ? n * 1000 : n;
}

/** 毫秒时间戳 → CST 时区当日零点的 UTC 毫秒表示（用于日历天数差比较） */
function cstDayStart(ms: number): number {
  const cst = new Date(ms + CST_OFFSET_MS);
  return Date.UTC(cst.getUTCFullYear(), cst.getUTCMonth(), cst.getUTCDate());
}

/**
 * 剩余日历天数（CST 时区）：截止日与今天的日历差。
 *
 * 与 formatDeadlineZh 的相对日期标签同口径：截止"明天 08:00"返回 1
 * （而非按 24h 向上取整得 2），保证"明天"标签与"剩余 1 天"永不矛盾。
 *
 * @returns 日历剩余天数（0 = 今天截止，负数 = 已过期）；无效输入返回 null
 */
export function calendarDaysLeftCst(ms: number): number | null {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.round((cstDayStart(ms) - cstDayStart(Date.now())) / 86400000);
}
