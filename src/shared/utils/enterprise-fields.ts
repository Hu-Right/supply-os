/**
 * 企业信息表单字段归一（前后端共用，唯一实现）
 *
 * @module shared/utils/enterprise-fields
 * @description 企业页两个「强类型列」的入参归一：
 *   - `established_at`：DB 是 DATE，GET 响应却是 Date 序列化后的 ISO 串
 *     （如 `2008-03-14T16:00:00.000Z`，24 字符）。表单原样回填再保存会撞
 *     zod `max(20)`（400 "Too big"）；若手改成带时间/斜杠的写法又会撞 MySQL DATE（500）。
 *     本模块统一把各种常见写法归一到 `YYYY-MM-DD`，并按**北京时间**还原 ISO 串的日期
 *     （DB 里的 DATE 是按中国日历日写入的，直接 slice UTC 会差一天）。
 *   - `registered_capital`：DB 是 DECIMAL(16,2) 且**元口径**（天眼查/内网净源导入
 *     写进来的就是 7800000000.00 这类元值），而表单提示却允许「500万元」；
 *     原样落库会 SQL 报错（500）。这里剥掉千分位/币种后按单位换算成**元**：
 *     带「万/万元」乘 1e4、「亿/亿元」乘 1e8，不带单位即视作元。用 BigInt 定点运算，
 *     避免浮点尾巴，并确保结果落在 DECIMAL(16,2) 可存范围内（超出按非法返回）。
 */

const DATE_ONLY = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/;
const DATE_CN = /^(\d{4})年(\d{1,2})月(\d{1,2})日?$/;
const ISO_LIKE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function validYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** ISO 串 → 北京时间日历日（YYYY-MM-DD）；非法返回 null */
function isoToShanghaiDate(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date(t));
    const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
    const y = get("year"); const m = get("month"); const d = get("day");
    return y && m && d ? `${y}-${m}-${d}` : null;
  } catch {
    return null;
  }
}

/**
 * 成立日期归一：接受 `YYYY-MM-DD` / `YYYY/MM/DD` / `YYYY.MM.DD` / `YYYY年MM月DD日` /
 * ISO 日期时间串；空串返回空串；认不出/非法日期原样返回（交给 zod 报错）。
 */
export function normalizeEstablishedAt(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (ISO_LIKE.test(s)) {
    const local = isoToShanghaiDate(s);
    if (local) return local;
  }
  const m = DATE_ONLY.exec(s) ?? DATE_CN.exec(s);
  if (!m) return s;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!validYmd(y, mo, d)) return s;
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

/** 供表单回填：任意 Date/ISO/日期串 → 北京时间日历日（YYYY-MM-DD）；无效返回空串 */
export function formatEstablishedAtForInput(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "";
  const s = String(raw);
  if (ISO_LIKE.test(s)) return isoToShanghaiDate(s) ?? "";
  // 已是 YYYY-MM-DD：按字面保留（DB DATE 的日历日就是本地日）
  const normalized = normalizeEstablishedAt(s);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

/**
 * 注册资本归一：剥掉币种与千分位后，按「万/亿」单位换算成**元**（DECIMAL(16,2) 列口径），
 * 结果最多两位小数；不带单位即视作元（与存量导入数据同口径）。
 * 空串返回空串；认不出、或换算后超出 DECIMAL(16,2) 上限时原样返回（交给 zod/本地校验报错）。
 */
const CAPITAL_NUM = /^(\d{1,16})(?:\.(\d{1,8}))?$/;
/** 单位 → 乘数（元口径）；「元」与不带单位同档 */
const CAPITAL_UNIT: Record<string, bigint> = {
  "": 1n, 元: 1n,
  万: 10000n, 万元: 10000n,
  亿: 100000000n, 亿元: 100000000n,
};
/** DECIMAL(16,2) 能存的上限（以百分之一元为单位）：99999999999999.99 元 */
const CAPITAL_MAX_CENTS = 9999999999999999n;

/** 四舍五入（half-up）的 BigInt 除法 */
function divRoundHalfUp(num: bigint, den: bigint): bigint {
  const q = num / den;
  const r = num % den;
  return r * 2n >= den ? q + 1n : q;
}

export function normalizeRegisteredCapital(raw: unknown): string {
  const original = String(raw ?? "").trim();
  if (!original) return "";
  // 先剥币种与千分位/空格（小数点要留着），剩下的形如「5000万」「￥5,000,000元」「1.5亿元」
  const stripped = original.replace(/[￥¥]|人民币|[ ,]/g, "");
  const m = /^(\d+(?:\.\d+)?)(万(?:元)?|亿(?:元)?|元)?$/.exec(stripped);
  if (!m) return original;
  const num = CAPITAL_NUM.exec(m[1]);
  if (!num) return original;
  const [, intPart, fracPart = ""] = num;
  const factor = CAPITAL_UNIT[m[2] ?? ""];
  if (factor === undefined) return original;

  // 以 10^-len(frac) 元为单位做定点乘法，再换算到「分」，最后折成带两位小数的元串
  const scaled = BigInt(intPart + fracPart); // 元 × 10^fracLen
  const yuanCents = divRoundHalfUp(scaled * factor * 100n, 10n ** BigInt(fracPart.length));
  if (yuanCents > CAPITAL_MAX_CENTS) return original;

  const whole = yuanCents / 100n;
  const cents = yuanCents % 100n;
  if (cents === 0n) return whole.toString();
  return `${whole}.${cents.toString().padStart(2, "0")}`;
}

/** 是否合法注册资本数字串（归一后） */
export function isValidRegisteredCapital(raw: string): boolean {
  return /^\d{1,14}(?:\.\d{1,2})?$/.test(raw);
}
