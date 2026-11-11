/**
 * 公告日期统一格式化（纯函数，全站唯一展示出口）
 *
 * 规范口径（已与用户锁定）：
 *   - 时区：UTC
 *   - 格式：有真实时刻 → `YYYY-MM-DD HH:mm`；只有日期 → `YYYY-MM-DD`（不臆造 `00:00`）
 *   - 无值/占位/可疑/解析失败：统一显示「未公布」，绝不显示成假日期
 *
 * 归属：纯工具、零服务端依赖，落 `@/shared`（红线 3：features 不得 import `@/lib`）。
 */
import { parseNoticeDate } from "./parse";

/** 无可用时间时的占位文案 */
export const UNPUBLISHED_LABEL = "未公布";

/** 全站统一的截止时间展示时区（2026-11-11 口径统一：一律北京时间） */
export const NOTICE_DISPLAY_TIME_ZONE = "Asia/Shanghai";

const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * 按指定 IANA 时区输出 `YYYY-MM-DD[ HH:mm]`（全站唯一实现）。
 * 不用 Intl 的本地化日期串（zh 出 `2026/11/19`、en 出 `11/19/2026`），
 * 保证同一时刻在任何界面语言下都是同一个字符串。
 */
export function formatInTimeZone(ms: number, timeZone: string, withTime = false): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(ms)) parts[p.type] = p.value;
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  if (!withTime) return date;
  // 部分引擎对 0 点返回 "24"，统一归一到 "00"
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${date} ${hour}:${parts.minute}`;
}

/** 按全站统一展示时区（北京时间）格式化 UTC 秒；供 SEO 页等无时区令牌的出口使用 */
export function formatNoticeCstDate(ts: number | null | undefined, hasTime = false): string {
  if (ts === null || ts === undefined || !Number.isFinite(ts) || ts <= 0) return UNPUBLISHED_LABEL;
  return formatInTimeZone(ts * 1000, NOTICE_DISPLAY_TIME_ZONE, hasTime);
}

/**
 * 报告/导出场景的截止时间文本（与前端同一口径）：
 *   - 默认北京时间，带「（北京时间）」标注；
 *   - timezoneSource=assumed_utc（源只有墙上时分）→ 按 UTC 还原并标「（原文当地时间）」，
 *     避免把原文 10:00 折算成 18:00。
 */
export function formatDeadlineForExport(
  deadlineTs: number | null | undefined,
  timezoneSource?: string | null,
  deadlineTimezone?: string | null,
): string {
  if (deadlineTs === null || deadlineTs === undefined) return "";
  const ts = Number(deadlineTs);
  if (!Number.isFinite(ts) || ts <= 0) return "";
  const source = String(timezoneSource ?? "").trim();
  // 源只有日期：只出日期，绝不补 00:00 / 08:00 这种臆造时刻
  if (source === "date") return formatInTimeZone(ts * 1000, NOTICE_DISPLAY_TIME_ZONE, false);
  const wallTime = source === "assumed_utc" && !deadlineTimezone;
  return wallTime
    ? `${formatInTimeZone(ts * 1000, "UTC", true)}（原文当地时间）`
    : `${formatInTimeZone(ts * 1000, NOTICE_DISPLAY_TIME_ZONE, true)}（北京时间）`;
}

/**
 * 按统一规范格式化一个 UTC 秒时间戳。
 * @param ts 时间戳（UTC 秒）；null/undefined/<=0 → 「未公布」
 * @param hasTime 是否显示 `HH:mm`（源无真实时刻时传 false，避免臆造零点）
 */
export function formatNoticeUTCDate(ts: number | null | undefined, hasTime = false): string {
  if (ts === null || ts === undefined || !Number.isFinite(ts) || ts <= 0) return UNPUBLISHED_LABEL;
  const d = new Date(ts * 1000);
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return hasTime ? `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : date;
}

/**
 * 一步到位：解析发布日期原文并按统一规范格式化。
 * 解析失败/空 → 「未公布」。
 */
export function formatNoticeDate(raw: string | null | undefined): string {
  const parsed = parseNoticeDate(raw);
  if (!parsed) return UNPUBLISHED_LABEL;
  return formatNoticeUTCDate(parsed.ts, parsed.hasTime);
}

/**
 * 解析并发布局格式化；不可解析返回 null（不内置占位文案）。
 * 供 i18n 调用方自定兜底（如英文站用 t() 而非硬编码「未公布」）。
 */
export function formatNoticeDateOrNull(raw: string | null | undefined): string | null {
  const parsed = parseNoticeDate(raw);
  return parsed ? formatNoticeUTCDate(parsed.ts, parsed.hasTime) : null;
}

/**
 * 语义层决定对外可见的截止时刻（SEO 页与解锁详情页共用唯一口径）：
 *   - 有语义层行：仅 state=known 且 effective_ts>0 才用，否则 null（不可信不露）
 *   - 无语义层行（未回填）：优雅退化到生成列 deadline_sec（仍不暴露 raw 脏串）
 * @returns 可展示的 UTC 秒时间戳；无可信值返回 null（上层显示占位）
 */
export function resolveNoticeDeadlineTs(input: {
  state?: string | null;
  effectiveTs?: number | null;
  fallbackSec?: number | null;
}): number | null {
  if (input.state != null) {
    return input.state === "known" && input.effectiveTs != null && input.effectiveTs > 0
      ? input.effectiveTs
      : null;
  }
  return input.fallbackSec != null && input.fallbackSec > 0 ? input.fallbackSec : null;
}
