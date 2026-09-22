/**
 * RFQ 向导工具函数
 * @module features/rfq/components/RfqWizard/utils
 */

/** 明天 ISO 日期（截止时间下限，本地时区） */
export function tomorrowIso(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
