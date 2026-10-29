/**
 * 公告列表/详情共用的展示格式化。
 *
 * 同一字段只允许在这里决定显示文本，避免列表与详情各自 format 后漂移。
 */
import { toUnixMs } from "@/shared/utils/unixTs";

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** 金额：紧凑/完整两种密度都保留币种码，不假设美元。 */
export function formatNoticeAmount(
  value: unknown,
  currencyCode: string | null | undefined,
  locale: string,
  compact = false,
): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  const text = new Intl.NumberFormat(locale === "zh" ? "zh-CN" : locale, {
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 2,
  }).format(n);
  const currency = String(currencyCode || "").trim().toUpperCase();
  return currency ? `${text} ${currency}` : text;
}

/**
 * 截止时间：列表与详情共用同一个绝对时间文本。
 * deadline_ts 已是归一后的 UTC 瞬间；中文按北京时间展示，其他语言按 UTC 展示，
 * 源时区放在括号里，不把「假设时区」冒充成用户本地时区。
 */
export function formatNoticeDeadline(
  deadlineTs: number | string | null | undefined,
  deadlineType: string | null | undefined,
  deadlineTimezone: string | null | undefined,
  locale: string,
  t: Translate,
): string {
  if (deadlineTs == null || deadlineTs === "") return "";
  const ms = toUnixMs(deadlineTs);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";

  const typeKey = deadlineType === "registration"
    ? "procurement_deadlineRegistration"
    : deadlineType === "framework_end"
      ? "procurement_deadlineFramework"
      : "";
  const prefix = typeKey ? `${t(typeKey)}${locale === "zh" ? "：" : ": "}` : "";
  const formatted = new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : locale, {
    timeZone: locale === "zh" ? "Asia/Shanghai" : "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  const tz = String(deadlineTimezone || "").trim();
  return `${prefix}${formatted}${tz ? ` (${tz})` : ""}`;
}

/**
 * 参考编号优先，缺失才回退门户 notice_id；两处同一口径。
 * JP-GP（日本政府采购门户抓取管线）例外：该来源没有公开标号，reference 落的是
 * 原站 URL 路径/base64（2026-10-28 已清存量 401 行，爬虫侧截断前此守卫防复发）——
 * 编号是编号、网页是网页，一律显示平台编号 noticeId，不显示路径。
 */
export function formatNoticeReference(reference: unknown, noticeId: unknown): string {
  const nid = String(noticeId ?? "").trim();
  if (nid.startsWith("JP-GP-")) return nid;
  return String(reference ?? "").trim() || nid || "";
}
