/**
 * RFQ 展示格式化（唯一出口）
 * @module features/rfq/model/format
 *
 * @description 重构前同一需求在广场、详情、工作台三处显示不同截止日（UTC vs 本地），
 *              预算则同时存在"万元当元""$100 万"两种错法。本模块把三个口径收在一处：
 *              - 金额：库里存**元**，展示按"元 / 万元"自动切换，保密与未填都显示"预算保密"；
 *              - 日期：一律按 Asia/Shanghai 取日（与后端 `close_at` 的折算口径一致）；
 *              - 倒计时：截止 / SLA 两种，统一文案。
 *
 *              2026-11 i18n 整改：本模块原先把中文文案直接当返回值
 *              （预算保密 / X 万元 / 剩 N 天 / 已截止 / 长期有效 / 已等待 N 小时），
 *              被广场、详情、工作台、受邀页直接插值，切到 en/fr/ru/es/ar/pt 后仍是中文。
 *              现改为「文案走 i18n 键 + 允许注入 t」：调用方传 `t`（来自 useLocale）即输出当前语言，
 *              不传则回落中文原样 —— 保持纯函数可测，且不把 React/Context 依赖牵进 model 层。
 */
import { currencySymbol } from "@/shared/utils/format";

const SHANGHAI_OFFSET_SEC = 8 * 3600;

/** 注入的翻译函数签名（与 core/i18n 的 t 一致；不传则回落中文） */
export type FormatterT = (key: string, params?: Record<string, string | number>) => string;

/** 中文兜底：无 t 时的原样行为（服务端脚本/单测用，不参与界面渲染） */
const zh: FormatterT = (_key, params) => {
  const p = params ?? {};
  const table: Record<string, string> = {
    rfqBudgetConfidential: "预算保密",
    rfqBudgetWanSymbol: `${p.symbol ?? ""}${p.budget ?? ""} 万`,
    rfqBudgetYuanSymbol: `${p.symbol ?? ""}${p.budget ?? ""} 元`,
    rfqCountdownLongTerm: "长期有效",
    rfqCountdownClosed: "已截止",
    rfqCountdownHours: `剩 ${p.n ?? ""} 小时`,
    rfqCountdownDays: `剩 ${p.n ?? ""} 天`,
    rfqReviewWaitUnderHour: "已等待不到 1 小时",
    rfqReviewWaitOverdue: `已超时 ${p.n ?? ""} 小时`,
    rfqReviewWaitHours: `已等待 ${p.n ?? ""} 小时`,
  };
  return table[_key] ?? _key;
};

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
 * - 保密或未填 → 「预算保密」
 * - ≥ 1 万 → 以万元展示（整数不带小数）
 * - < 1 万 → 以元展示
 */
export function formatBudget(
  amount: number | null | undefined,
  currency: string,
  confidential = false,
  t: FormatterT = zh,
): string {
  if (confidential || amount == null || amount <= 0) return t("rfqBudgetConfidential");
  const symbol = currencySymbol(currency || "CNY");
  if (amount >= 10_000) {
    const wan = amount / 10_000;
    const text = Number.isInteger(wan) ? String(wan) : wan.toFixed(2);
    return t("rfqBudgetWanSymbol", { symbol, budget: text });
  }
  return t("rfqBudgetYuanSymbol", { symbol, budget: String(Math.round(amount)) });
}

/** 截止倒计时：剩 N 天 / 剩 N 小时 / 已截止 / 长期有效 */
export function formatCloseCountdown(
  closeAt: number | null | undefined,
  nowSec = Date.now() / 1000,
  t: FormatterT = zh,
): string {
  if (!closeAt || closeAt <= 0) return t("rfqCountdownLongTerm");
  const diff = closeAt - nowSec;
  if (diff <= 0) return t("rfqCountdownClosed");
  if (diff < 24 * 3600) return t("rfqCountdownHours", { n: Math.max(1, Math.round(diff / 3600)) });
  return t("rfqCountdownDays", { n: Math.ceil(diff / 86400) });
}

/** 审核 SLA：已等待 N 小时 / 已超时 N 小时 */
export function formatReviewWait(
  submittedAt: number | null | undefined,
  slaHours: number,
  nowSec = Date.now() / 1000,
  t: FormatterT = zh,
): { text: string; overdue: boolean } {
  if (!submittedAt || submittedAt <= 0) return { text: "", overdue: false };
  const waitedHours = (nowSec - submittedAt) / 3600;
  if (waitedHours < 1) return { text: t("rfqReviewWaitUnderHour"), overdue: false };
  const overdue = waitedHours > slaHours;
  const hours = Math.floor(waitedHours);
  return overdue
    ? { text: t("rfqReviewWaitOverdue", { n: Math.max(1, Math.floor(waitedHours - slaHours)) }), overdue: true }
    : { text: t("rfqReviewWaitHours", { n: hours }), overdue: false };
}
