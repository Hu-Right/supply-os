/**
 * 中文时间格式化工具
 * Chinese Time Formatter
 *
 * @module features/procurement/utils/formatDeadlineZh
 * @description 将日期字符串转换为中文时间格式（"今天 X时X分"、"X月X日 X时X分"等）
 *              仅用于中文环境，其他语言保持原始格式
 */

/**
 * 将日期字符串格式化为中文时间（精确到时分）
 * @param deadline - 日期字符串（支持 ISO 格式如 "2026-08-15" 或 "2026-08-15T14:30:00"）
 * @returns 中文时间字符串，如 "今天 14时30分"、"8月15日 09时00分"
 */
export function formatDeadlineZh(deadline: string | null | undefined): string {
  if (!deadline) return "";

  const date = new Date(deadline);
  if (isNaN(date.getTime())) return deadline; // 无法解析时返回原始值

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  // 提取时分
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const timeStr = `${hours}时${minutes}分`;

  // 相对日期前缀
  if (diffDays === 0) return `今天 ${timeStr}`;
  if (diffDays === 1) return `明天 ${timeStr}`;
  if (diffDays === 2) return `后天 ${timeStr}`;
  if (diffDays === -1) return `昨天 ${timeStr}`;
  if (diffDays === -2) return `前天 ${timeStr}`;

  // 其他日期：X月X日 X时X分
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日 ${timeStr}`;
}
