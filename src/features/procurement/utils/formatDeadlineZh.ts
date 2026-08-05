/**
 * 中文时间格式化工具（含时区转换）
 * Chinese Time Formatter with Timezone Conversion
 *
 * @module features/procurement/utils/formatDeadlineZh
 * @description 将日期/时间戳转换为中文时间格式（"今天 HH时MM分"、"X月X日 HH时MM分"等）。
 *              优先使用 deadline_ts（Unix 时间戳）做 UTC→CST(UTC+8) 转换；
 *              无时间戳时回退到 deadline 字符串（按 UTC 解析后转 CST）。
 *              仅用于中文环境，其他语言保持原始格式。
 */

/** 中国标准时间偏移：UTC+8（毫秒） */
const CST_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * 将日期字符串或时间戳格式化为中文时间（精确到时分，CST 时区）
 * @param deadline - 日期字符串（ISO 格式，UTC）
 * @param deadlineTs - Unix 时间戳（秒级或毫秒级均可）
 * @returns 中文时间字符串，如 "今天 22时30分"、"8月15日 09时00分"
 */
export function formatDeadlineZh(
  deadline: string | null | undefined,
  deadlineTs?: number | string | null,
): string {
  // 优先使用时间戳（更可靠，无解析歧义）
  let date: Date;

  if (deadlineTs != null && deadlineTs !== "") {
    let ts = typeof deadlineTs === "string" ? Number(deadlineTs) : deadlineTs;
    if (isNaN(ts)) return deadline || "";
    // 秒级时间戳转毫秒（大于 10^12 视为毫秒级）
    if (ts < 1e12) ts = ts * 1000;
    date = new Date(ts);
  } else if (deadline) {
    // 回退：将 deadline 字符串按 UTC 解析
    date = new Date(deadline + (deadline.includes("T") || deadline.includes(" ") ? "" : "T00:00:00") + "Z");
  } else {
    return "";
  }

  if (isNaN(date.getTime())) return deadline || "";

  // UTC → CST (UTC+8)
  const cstDate = new Date(date.getTime() + CST_OFFSET_MS);

  // 计算 CST 的"今天"零点
  const nowUtc = new Date();
  const cstNow = new Date(nowUtc.getTime() + CST_OFFSET_MS);
  const todayStart = Date.UTC(cstNow.getUTCFullYear(), cstNow.getUTCMonth(), cstNow.getUTCDate());

  const targetStart = Date.UTC(cstDate.getUTCFullYear(), cstDate.getUTCMonth(), cstDate.getUTCDate());
  const diffDays = Math.round((targetStart - todayStart) / (1000 * 60 * 60 * 24));

  // 提取 CST 时分
  const hours = cstDate.getUTCHours().toString().padStart(2, "0");
  const minutes = cstDate.getUTCMinutes().toString().padStart(2, "0");
  const timeStr = `${hours}时${minutes}分`;

  // 相对日期前缀
  if (diffDays === 0) return `今天 ${timeStr}`;
  if (diffDays === 1) return `明天 ${timeStr}`;
  if (diffDays === 2) return `后天 ${timeStr}`;
  if (diffDays === -1) return `昨天 ${timeStr}`;
  if (diffDays === -2) return `前天 ${timeStr}`;

  // 其他日期：YYYY年X月X日 HH时MM分（含年份，避免跨年歧义）
  const year = cstDate.getUTCFullYear();
  const month = cstDate.getUTCMonth() + 1;
  const day = cstDate.getUTCDate();
  return `${year}年${month}月${day}日 ${timeStr}`;
}
