/**
 * 截止时区「机器令牌」解析（唯一实现）
 *
 * @module shared/utils/notice-datetime/timezone
 * @description 语义层（notice_deadline.deadline_timezone）只产出可计算的令牌：
 *              `GMT±HH:MM`（显式偏移，如 GMT+08:00）或 `UTC`，也可能出现 IANA 形如
 *              `Europe/Riga`（历史回填）——这些才能拿去把 UTC 瞬间换算成「发标地当地时间」。
 *
 *              抓取侧另有自由文本（商机表 deadline_timezone 里常见
 *              「菲律宾时间（PHT，UTC+8）；北京时间（UTC+8）」这类页面原文注释）：
 *              它不是可计算令牌，前端不得把它拼进截止时间（否则详情页出现一长串时区说明）。
 *              想展示发标地时间，只认本模块解析得出的令牌，其余一律丢弃。
 *
 *              归属：纯工具、零依赖，落 `@/shared`（红线 3：features 不得 import `@/lib`）。
 */

export type DeadlineZone =
  | { kind: "offset"; minutes: number }
  | { kind: "iana"; zone: string };

/** GMT/UTC 偏移：GMT+08:00 / GMT-4 / UTC+05:45 / GMT+0800；裸 UTC / GMT 视作 +00:00 */
const GMT_OFFSET_RE = /^(?:GMT|UTC)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i;
const BARE_UTC_RE = /^(?:GMT|UTC)$/i;

/**
 * 解析时区令牌；不是可计算令牌（自由文本、空值、越界偏移）一律返回 null。
 * IANA 令牌用 Intl 做一次构造校验，避免脏串把运行时格式化打爆。
 */
export function parseDeadlineZone(raw: unknown): DeadlineZone | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  if (BARE_UTC_RE.test(s)) return { kind: "offset", minutes: 0 };

  const m = GMT_OFFSET_RE.exec(s);
  if (m) {
    const hours = Number(m[2]);
    const minutes = Number(m[3] ?? 0);
    if (hours > 14 || minutes > 59) return null;
    const sign = m[1] === "-" ? -1 : 1;
    return { kind: "offset", minutes: sign * (hours * 60 + minutes) };
  }

  // IANA：Area/City（至少两段），拒绝带空格/中文/分号的自由文本
  if (/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)+$/.test(s)) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: s });
      return { kind: "iana", zone: s };
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * 从若干候选值中取第一个可解析的时区令牌（返回原串，便于直接透传）。
 * 典型用法：先认宽表语义列，再认商机表（可能是自由文本，会被 parseDeadlineZone 过滤掉）。
 * 无可用令牌返回 ""。
 */
export function pickDeadlineZoneToken(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (parseDeadlineZone(candidate)) return String(candidate).trim();
  }
  return "";
}
