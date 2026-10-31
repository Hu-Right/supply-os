/**
 * 公告展示层通用工具 — 全站公告字段显示文本的唯一决定处
 * Notice Display Utilities — single place deciding display text for notice fields
 *
 * @module shared/utils/noticeDisplay
 * @description 2026-10-31 数据归一化收口：formatNoticeAmount/Deadline/Reference 自
 *              features/procurement/utils/noticeDisplay 上移（依赖本就全在 shared），
 *              至此列表卡、详情页、相似机会、首页滚动卡共用同一实现，任何字段
 *              「同一字段只允许在这里决定显示文本」。
 *              并新增 pickNoticeTitle 收敛此前三条各写各的标题回退链
 *              （列表 zh→titleCn||title、详情 zh→titleCn→译文→title、首页
 *              titleI18n||titleEn||title 从不读中文列）。
 *              features/procurement/utils/noticeDisplay 保留 re-export 面兼容既有消费方。
 */
import { toUnixMs } from "@/shared/utils/unixTs";
import { parseDeadlineZone } from "@/shared/utils/notice-datetime/timezone";

type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * 公告展示层所需的最小字段口径。
 * 字段名对齐 /api/notices/unified-search 的响应视图（红线② camelCase）。
 * 2026-10-31 增补 titleCn / currencyCode / deadlineTimezone / timezoneSource——
 * 首页滚动卡改走统一口径后需要这些字段（此前孤本实现缺它们正是漂移根源）。
 */
export interface NoticeDisplayFields {
  title: string;
  titleCn?: string | null;
  titleI18n?: string | null;
  titleEn?: string | null;
  agencyI18n?: string | null;
  buyerName?: string | null;
  buyerNameCn?: string | null;
  countryCode?: string | null;
  estimatedValue?: string | number | null;
  currencyCode?: string | null;
  deadlineTs?: number | string | null;
  noticeTypeCode?: string | null;
  deadlineType?: string | null;
  deadlineTimezone?: string | null;
  timezoneSource?: string | null;
}

/**
 * 标题显示回退链（三链收敛为一条）：
 * zh → titleCn（服务表确认中文列）→ titleI18n（按需译文）→ title；
 * 非 zh → titleI18n → titleEn → title。
 */
export function pickNoticeTitle(n: NoticeDisplayFields, locale?: string): string {
  if (locale === "zh") return n.titleCn || n.titleI18n || n.title;
  return n.titleI18n || n.titleEn || n.title;
}

/**
 * 采购机构显示回退链（2026-10-30 首页向服务表对齐）：
 * zh → buyerNameCn（服务表快照列，与列表卡 NoticeCard 同源同值）→ buyerName；
 * 非 zh → buyerName 原名（中文列不得漏进其他语言界面）。
 * agencyI18n（别名表读时解析链）退役：同一买家此前会出现「列表页中文、首页英文」
 * 的可见分歧（别名表未登记而机翻表已翻的名字），本链与之脱钩后三面统一。
 */
export function displayNoticeAgency(n: NoticeDisplayFields, locale?: string): string {
  if (locale === "zh") return n.buyerNameCn || n.buyerName || "";
  return n.buyerName || "";
}

/** 金额：紧凑/完整两种密度都保留币种码，不假设美元。无值/非正数返回空串（空态文案归调用方）。 */
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
 * 截止时间：列表与详情共用同一个「发标地当地时间」文本。
 *
 * 口径（2026-10-30 用户确认）：
 *   · 有可计算时区令牌（GMT±HH:MM / UTC / IANA）→ 把 UTC 瞬间换算到该时区，
 *     即发标地当地时间；不再在时间后面拼时区说明，保持一眼可读。
 *   · 语义层时间来源（timezoneSource）：
 *       - assumed_utc：ts 是「源页面墙上时间按 UTC 存」，按 UTC 还原墙上时间；
 *       - date：源只有日期没有时刻，只显示日期（不臆造 00:00）；
 *       - explicit：令牌已在上面生效。
 *   · 都没有（无令牌、无语义行）：沿用历史 deadline_sec 口径——中文按 +08:00 还原，
 *     其他语言按 UTC，只出时间不出注释。
 *   · 抓取侧的自由文本时区注释（如「菲律宾时间（PHT，UTC+8）；北京时间（UTC+8）」）
 *     一律不进展示：那不是可计算令牌，拼上去只会让截止时间变成一长串说明。
 */
export function formatNoticeDeadline(
  deadlineTs: number | string | null | undefined,
  deadlineType: string | null | undefined,
  deadlineTimezone: string | null | undefined,
  locale: string,
  t: Translate,
  timezoneSource?: string | null,
): string {
  if (deadlineTs == null || deadlineTs === "") return "";
  const ms = toUnixMs(deadlineTs);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  if (Number.isNaN(new Date(ms).getTime())) return "";

  const typeKey = deadlineType === "registration"
    ? "procurement_deadlineRegistration"
    : deadlineType === "framework_end"
      ? "procurement_deadlineFramework"
      : "";
  const prefix = typeKey ? `${t(typeKey)}${locale === "zh" ? "：" : ": "}` : "";
  const formatted = formatAtDeadlineZone(ms, deadlineTimezone, locale, timezoneSource);
  return `${prefix}${formatted}`;
}

/** 按「发标地时区」格式化 UTC 瞬间（内部实现，列表/详情共用）。 */
function formatAtDeadlineZone(
  ms: number,
  deadlineTimezone: string | null | undefined,
  locale: string,
  timezoneSource: string | null | undefined,
): string {
  const intlLocale = locale === "zh" ? "zh-CN" : locale;
  const source = String(timezoneSource ?? "").trim();
  // date：源只有日期；assumed_utc：ts 就是墙上时间（按 UTC 存）——两者都无需时区换算
  const withTime = source !== "date";
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  };

  const zone = parseDeadlineZone(deadlineTimezone);
  if (zone?.kind === "iana") {
    return new Intl.DateTimeFormat(intlLocale, { ...options, timeZone: zone.zone }).format(ms);
  }
  if (zone?.kind === "offset") {
    // 固定偏移：先平移时间戳，再以 UTC 口径格式化（避免依赖运行环境的 offset 时区支持）
    return new Intl.DateTimeFormat(intlLocale, { ...options, timeZone: "UTC" }).format(
      ms + zone.minutes * 60_000,
    );
  }
  if (source === "assumed_utc") {
    return new Intl.DateTimeFormat(intlLocale, { ...options, timeZone: "UTC" }).format(ms);
  }
  // 无时区信息：沿用历史口径（中文按 +08:00 还原墙上时间，其他语言 UTC）
  return new Intl.DateTimeFormat(intlLocale, {
    ...options,
    timeZone: locale === "zh" ? "Asia/Shanghai" : "UTC",
  }).format(ms);
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
