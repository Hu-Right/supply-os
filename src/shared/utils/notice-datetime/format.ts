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

const pad = (n: number): string => String(n).padStart(2, "0");

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
