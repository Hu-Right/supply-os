/**
 * 截止倒计时计算工具 — CST (UTC+8) 时区
 * Deadline Countdown Calculator — CST Timezone
 *
 * @module shared/utils/countdown
 * @description 从 features/procurement/components/NoticeDetail 提取的
 *              通用倒计时计算函数。按北京时间计算剩余天/时/分/秒。
 *              供招标详情页、首页倒计时标签等场景复用。
 */

/** CST 时区偏移：UTC+8（毫秒） */
const CST_OFFSET_MS = 8 * 3600 * 1000;

// 秒/毫秒归一化收敛（2026-09-12）：判别谓词统一由 unixTs 提供（边界 1e12 归毫秒）
import { toUnixMs } from "./unixTs";

export interface CountdownResult {
  days: number;
  /** HH:MM:SS 格式 */
  time: string;
}

/**
 * 计算截止倒计时（按北京时间 CST UTC+8）
 *
 * @param deadlineTs - Unix 时间戳（秒级或毫秒级均可）
 * @returns 剩余天/时/分/秒，已截止或无效输入返回 null
 */
export function getCountdown(deadlineTs?: number | string | null): CountdownResult | null {
  const ms = toUnixMs(deadlineTs);
  if (!Number.isFinite(ms) || ms <= 0) return null;

  const deadlineCst = new Date(ms + CST_OFFSET_MS);
  const nowCst = new Date(Date.now() + CST_OFFSET_MS);
  const diff = deadlineCst.getTime() - nowCst.getTime();
  if (diff <= 0) return null;

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);

  return {
    days,
    time: `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`,
  };
}

/**
 * 格式化发布时间（支持 Unix 时间戳和 ISO 字符串）
 *
 * @param createTime - Unix 时间戳（秒/毫秒）或 ISO 日期字符串
 * @returns YYYY-MM-DD 格式，无效输入返回 "-"
 */
export function formatPublishDate(createTime?: string | number): string {
  if (!createTime) return "-";
  try {
    let date: Date;
    if (typeof createTime === "number") {
      date = new Date(toUnixMs(createTime));
    } else {
      date = new Date(createTime);
    }
    if (isNaN(date.getTime()) || date.getFullYear() < 2000) return "-";
    return date.toISOString().slice(0, 10);
  } catch { return "-"; }
}
