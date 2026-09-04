/**
 * 日期/时间格式化工具（架构评估 C1：消除跨 feature 手写重复）
 *
 * @module shared/utils/format
 * @description 统一收编各处逐字重复的日期格式化：培训期次展示（fmtDate×2）、
 *              支付记录时间（formatUserDateTime）。全部为纯函数、无时区依赖
 *              （沿用各调用点原始语义，不做隐式时区转换）。
 */

/** 通用两位补零 */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * 期次/课程日期展示：zh → "YYYY年M月D日"，其他 locale → 本地化短格式。
 * （原 training ScheduleSection/TrainingPaymentModal 逐字重复的 fmtDate）
 */
export function formatScheduleDate(value: string | Date, locale: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return locale === "zh"
    ? `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
    : date.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * 支付/解锁记录时间：yyyy-MM-dd HH:mm，空值 → "-"。
 * 无效字符串按原逻辑退回原值（去掉 T 与 .000Z 尾缀）。
 * （原 payment MyRecordsPanel 的 formatUserDateTime）
 */
export function formatDateTimeZh(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace("T", " ").replace(".000Z", "");
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/**
 * 权益/会员到期日展示：本地化短格式（含年份），解析失败返回原字符串。
 * （原 MembershipStatusPanel/UpgradeConfirmModal/AccountBenefitsCard 逐字重复的 formatDate）
 */
export function formatDateShort(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}
