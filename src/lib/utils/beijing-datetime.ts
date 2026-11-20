/**
 * 北京时间格式化工具
 * Beijing (CST, UTC+8) datetime formatting
 *
 * @module lib/utils/beijing-datetime
 * @description 把 JS Date 渲染成北京墙钟的 "YYYY-MM-DD HH:MM:SS"，供写入 MySQL DATETIME
 *              列使用。必须经本函数中转，禁止直接用 `toISOString()` 拼库值——
 *              toISOString 产出 UTC 墙钟，而库会话/`NOW()` 是北京钟（CST 无夏令时、固定 +8），
 *              直拼会让所有「相对当前的到期时间」凭空提前 8 小时。
 *
 *              2026-11-11 事故：认领单双时钟（无照 1 小时）用 toISOString 直写，
 *              -8h 后「出生即过期」，过期清扫一跑用户刚绑定的主体立即被静默解绑；
 *              带照 7 天审核窗口同样被偷 8 小时。三处写点（supplier-claims 路由、
 *              enterprise 路由双时钟/换照续期）已全部收敛到本函数。
 */

/** CST 固定 UTC+8（无夏令时），不做任何地区/ICU 依赖的字符串排版 */
const CST_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * Date → 北京墙钟 "YYYY-MM-DD HH:MM:SS"
 * 先加 8 小时再取 UTC 分量，等价于按 Asia/Shanghai 墙钟排版，无 ICU 依赖。
 */
export function formatBeijingDatetime(date: Date): string {
  return new Date(date.getTime() + CST_OFFSET_MS)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, "");
}

/** 当前时刻起 +ms 毫秒的北京墙钟到期串（认领双时钟等「相对到期时间」专用） */
export function beijingDatetimeAfter(ms: number): string {
  return formatBeijingDatetime(new Date(Date.now() + ms));
}

/**
 * 北京墙钟 "YYYY-MM-DD HH:MM:SS" → Unix 毫秒（formatBeijingDatetime 的逆运算）。
 * 显式按 UTC-8 折算回 epoch，不走 Date.parse——它按浏览器/进程本地时区解释，
 * 出海用户或 UTC 容器里会把同一串读出 8 小时差。
 * 非法/空输入返回 NaN，由调用方按「无到期时间」处理（与列 NULL 同路）。
 *
 * 2026-11-20 事故：GET /api/supplier-claims 曾把墙钟串原样透传给前端，
 * 前端倒计时只认 Unix ts，Number(墙钟串)=NaN 被直接判「认领已过期」全程误报。
 */
export function beijingDatetimeToMs(s: string | null | undefined): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(String(s ?? "").trim());
  if (!m) return NaN;
  // m[0] 是整匹配串：slice(1) 取捕获组后直接按位解构，不能再留前导空洞（会再跳一位）
  const [y, mo, d, h, mi, sec] = m.slice(1).map(Number);
  return Date.UTC(y, mo - 1, d, h, mi, sec) - CST_OFFSET_MS;
}
