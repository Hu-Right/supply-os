/**
 * RFQ 展示格式化（唯一出口）
 * @module features/rfq/model/format
 *
 * @description 重构前同一需求在广场、详情、工作台三处显示不同截止日（UTC vs 本地），
 *              预算则同时存在"万元当元""$100 万"两种错法。本模块把三个口径收在一处：
 *              - 金额：库里存**元**，展示按"元 / 万元"自动切换，保密与未填都显示"预算保密"；
 *              - 日期：一律按 Asia/Shanghai 取日（与后端 `close_at` 的折算口径一致）；
 *              - 倒计时：截止 / SLA 两种，统一文案。
 */
import { currencySymbol } from "@/shared/utils/format";

const SHANGHAI_OFFSET_SEC = 8 * 3600;

/** 秒 → Asia/Shanghai 的 yyyy-MM-dd */
export function formatYmd(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return "";
  const d = new Date((sec + SHANGHAI_OFFSET_SEC) * 1000);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 秒 → yyyy-MM-dd HH:mm（Asia/Shanghai，用于时间线） */
export function formatYmdHm(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return "";
  const d = new Date((sec + SHANGHAI_OFFSET_SEC) * 1000);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${formatYmd(sec)} ${hh}:${mm}`;
}

/**
 * 预算展示：入参是**元**。
 * - 保密或未填 → "预算保密"
 * - ≥ 1 万 → 以万元展示（整数不带小数）
 * - < 1 万 → 以元展示
 */
export function formatBudget(
  amount: number | null | undefined,
  currency: string,
  confidential = false,
): string {
  if (confidential || amount == null || amount <= 0) return "预算保密";
  const symbol = currencySymbol(currency || "CNY");
  if (amount >= 10_000) {
    const wan = amount / 10_000;
    const text = Number.isInteger(wan) ? String(wan) : wan.toFixed(2);
    return `${symbol}${text} 万元`;
  }
  return `${symbol}${Math.round(amount)} 元`;
}

/** 截止倒计时：剩 N 天 / 剩 N 小时 / 已截止 */
export function formatCloseCountdown(closeAt: number | null | undefined, nowSec = Date.now() / 1000): string {
  if (!closeAt || closeAt <= 0) return "长期有效";
  const diff = closeAt - nowSec;
  if (diff <= 0) return "已截止";
  if (diff < 24 * 3600) return `剩 ${Math.max(1, Math.round(diff / 3600))} 小时`;
  return `剩 ${Math.ceil(diff / 86400)} 天`;
}

/** 审核 SLA：已等待 N 小时 / 已超时 N 小时 */
export function formatReviewWait(
  submittedAt: number | null | undefined,
  slaHours: number,
  nowSec = Date.now() / 1000,
): { text: string; overdue: boolean } {
  if (!submittedAt || submittedAt <= 0) return { text: "", overdue: false };
  const waitedHours = (nowSec - submittedAt) / 3600;
  if (waitedHours < 1) return { text: "已等待不到 1 小时", overdue: false };
  const overdue = waitedHours > slaHours;
  const hours = Math.floor(waitedHours);
  return overdue
    ? { text: `已超时 ${Math.max(1, Math.floor(waitedHours - slaHours))} 小时`, overdue: true }
    : { text: `已等待 ${hours} 小时`, overdue: false };
}
