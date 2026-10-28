/**
 * 公告截止时间语义分类器（纯函数，唯一规则实现）
 *
 * 背景：bid_notices.deadline 是源库自由文本，不同源把「无截止日」
 * （西班牙 PLACSP 的 2125-12-31）、「框架/注册制结束日」、「年份笔误」
 * （2050/2206/2226）和「一次性投标截止日」混在同一个字符串里。
 * 本分类器不修改主表，只回答四件事：
 *   state       —— 这个截止时间可信到什么程度
 *   type        —— 它是投标截止、框架结束、注册制，还是授标/信息
 *   effectiveTs —— 对外的有效截止时间（UTC 秒）；不可信时为 null
 *   confidence  —— 0-100，供 API/人工排序
 *
 * 规则优先级（高 → 低）：
 *   1. 空 / 未公布 / deadline_ts=0            → unknown
 *   2. 命中哨兵日期（2125-12-31 等）          → placeholder
 *   3. 框架类来源 + 30 年内                    → known / framework_end
 *   4. 框架类来源 + 30 年以上                  → placeholder
 *   5. 注册制 + 月日与发布日接近 + 远年份      → typo_suspect
 *   6. 注册制 + 30 年内                        → known / registration
 *   7. 远年份 / 比发布年晚 10 年以上           → typo_suspect
 *   8. 其余                                   → known / bid
 *
 * 注意：typo_suspect 的 effectiveTs 故意留 null。年份笔误的「正确值」
 * 需要回源确认，不能在这里猜；API 默认也不返回 typo_suspect。
 */
export type DeadlineState =
  | "known"
  | "unknown"
  | "placeholder"
  | "typo_suspect"
  | "framework_end"
  | "invalid";

export type DeadlineType = "bid" | "framework_end" | "registration" | "award" | "info";

export interface DeadlineInput {
  /** 源库 deadline 原文 */
  deadline: string | null;
  /** 源库 deadline_ts：秒或毫秒均可 */
  deadlineTs: number | string | null;
  /** 发布日：ISO 或 DD-Mon-YYYY */
  publishedDate: string | null;
  title?: string | null;
  description?: string | null;
  country?: string | null;
}

export interface DeadlineVerdict {
  state: DeadlineState;
  type: DeadlineType;
  effectiveTs: number | null;
  confidence: number;
  reason: string;
  sourceRule: string;
  /** 源时间的时区/偏移；纯日期或无法识别时为 null */
  timezone?: string | null;
  timezoneSource?: "explicit" | "date" | "assumed_utc" | null;
}

/** 已知的「无截止日 / 长期开放」哨兵；新增来源时在这里登记，不要散落到 SQL */
export const SENTINEL_DEADLINES = [
  "2125-12-31",
  "2099-12-31",
  "2100-01-01",
  "2100-12-31",
  "2050-12-31",
  "9999-12-31",
] as const;

const SENTINEL_RE = /^(?:2125-12-31|2099-12-31|2100-01-01|2100-12-31|2050-12-31|9999-12-31)(?:[ T].*)?$/i;
const EMPTY_RE = /^(?:未公布|未公开|n\/?a|na|null|nil|-|--|—|无|待定)$/i;
const FRAMEWORK_RE =
  /\b(?:sad|sda|dps|rfsa|supply[-\s]?arrangement|dynamic[-\s]?purchasing|dynamic[-\s]?market|qualification[-\s]?system|prüfsystem|pruefsystem|marchalim|marchetravaux|sistema[-\s]?din[áa]mico[-\s]?de[-\s]?adquisici[oó]n|syst[èe]me[-\s]?d'acquisition[-\s]?dynamique|dynamisk[-\s]?indk[øo]bssystem|dynaaminen[-\s]?toimittajarekisteri|dynamisches[-\s]?beschaffungssystem|dynamiskt[-\s]?ink[öo]pssystem)\b/i;
const REGISTRATION_RE =
  /\b(?:credenciamento|homologaci[oó]n|homologation|registration[-\s]?system|sistema[-\s]?de[-\s]?homologaci[oó]n)\b/i;
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function normalizeTs(raw: number | string | null): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  // 源库混用秒/毫秒；与 bid_notices.deadline_sec 生成列同一判据
  return n > 100_000_000_000 ? Math.floor(n / 1000) : Math.floor(n);
}

interface ParsedDeadlineText {
  ts: number;
  timezone: string | null;
  timezoneSource: "explicit" | "date" | "assumed_utc";
}

/**
 * 解析源 deadline 文本为 UTC 秒。
 * 重点：DD-Mon-YYYY HH:mm (GMT ±x.xx) 必须按显式偏移换算，不能忽略时分/偏移。
 */
function parseDeadlineText(raw: string): ParsedDeadlineText | null {
  const s = raw.trim();
  if (!s) return null;

  // 两个分枝都会在用到前赋值，故不给初值（给了就是永不被读的死赋值）
  let y: number, mo: number, d: number;
  let hh: number | null = null, mm = 0, ss = 0;

  let m = /^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/ ](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()];
    if (mon === undefined) return null;
    y = Number(m[3]); mo = mon; d = Number(m[1]);
    if (m[4] != null) { hh = Number(m[4]); mm = Number(m[5]); ss = Number(m[6] ?? 0); }
  } else {
    m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
    if (!m) return null;
    y = Number(m[1]); mo = Number(m[2]) - 1; d = Number(m[3]);
    if (m[4] != null) { hh = Number(m[4]); mm = Number(m[5]); ss = Number(m[6] ?? 0); }
  }

  const local = Date.UTC(y, mo, d, hh ?? 0, mm, ss);
  if (!Number.isFinite(local)) return null;
  if (hh == null) return { ts: Math.floor(local / 1000), timezone: null, timezoneSource: "date" };

  // 显式 GMT/UTC 偏移：(GMT -4.00) / GMT+2 / UTC-03:30
  let offsetMin: number | null = null;
  let timezone: string | null = null;
  const gmt = /(?:GMT|UTC)\s*([+-]?\d{1,2})(?:[.:](\d{1,2}))?/i.exec(s);
  if (gmt) {
    const sign = gmt[1].startsWith("-") ? -1 : 1;
    offsetMin = sign * (Math.abs(Number(gmt[1])) * 60 + Number(gmt[2] ?? 0));
    const abs = Math.abs(Number(gmt[1]));
    timezone = `GMT${offsetMin < 0 ? "-" : "+"}${String(abs).padStart(2, "0")}:${String(Number(gmt[2] ?? 0)).padStart(2, "0")}`;
  } else {
    const trailing = /([+-])(\d{2}):?(\d{2})\s*$/.exec(s);
    if (trailing) {
      offsetMin = (trailing[1] === "-" ? -1 : 1) * (Number(trailing[2]) * 60 + Number(trailing[3]));
      timezone = `GMT${trailing[1]}${trailing[2]}:${trailing[3]}`;
    } else if (/Z\s*$/i.test(s)) {
      offsetMin = 0;
      timezone = "UTC";
    }
  }

  if (offsetMin != null) {
    return {
      ts: Math.floor(local / 1000) - offsetMin * 60,
      timezone,
      timezoneSource: "explicit",
    };
  }
  return { ts: Math.floor(local / 1000), timezone: null, timezoneSource: "assumed_utc" };
}

function utcParts(ts: number): { y: number; m: number; d: number } {
  const date = new Date(ts * 1000);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth(), d: date.getUTCDate() };
}

function parsePublished(raw: string | null): { y: number; m: number; d: number } | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
  m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(s);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()];
    if (mon === undefined) return null;
    return { y: Number(m[3]), m: mon, d: Number(m[1]) };
  }
  return null;
}

function dayOfYear(y: number, m: number, d: number): number {
  // 用 UTC 计算，避免本地时区把 1 月 1 日算到上一年
  return Math.floor((Date.UTC(y, m, d) - Date.UTC(y, 0, 1)) / 86_400_000);
}

/** 截止月日是否落在发布月日 ±120 天内（年份笔误的强特征） */
function monthDayNearPublished(ts: number, publishedDate: string | null): boolean {
  const pub = parsePublished(publishedDate);
  if (!pub) return false;
  const dl = utcParts(ts);
  const a = dayOfYear(dl.y, dl.m, dl.d);
  const b = dayOfYear(pub.y, pub.m, pub.d);
  const diff = Math.abs(a - b);
  return Math.min(diff, 365 - diff) <= 120;
}

function classifyType(input: DeadlineInput, year: number | null, nowYear: number): DeadlineType {
  const text = `${input.title ?? ""} ${input.description ?? ""}`;
  if (REGISTRATION_RE.test(text)) return "registration";
  // 只有「截止年份明显在未来」时，框架/DPS 关键字才表示「框架结束日」。
  // 否则 "Dynamic Market 2026" 这类“建立框架"的招标会被误判成框架结束日。
  if (FRAMEWORK_RE.test(text) && (year === null || year > nowYear + 2)) return "framework_end";
  return "bid";
}

/**
 * @param now 当前时间（UTC 秒），测试可注入；生产默认 Date.now()
 */
export function classifyDeadline(input: DeadlineInput, now = Math.floor(Date.now() / 1000)): DeadlineVerdict {
  const raw = (input.deadline ?? "").trim();
  const parsed = parseDeadlineText(raw);
  const ts = parsed?.ts ?? normalizeTs(input.deadlineTs);
  const tzFields = { timezone: parsed?.timezone ?? null, timezoneSource: parsed?.timezoneSource ?? null };
  const nowYear = new Date(now * 1000).getUTCFullYear();
  const yearMaybe = ts ? utcParts(ts).y : null;
  const type = classifyType(input, yearMaybe, nowYear);

  // 1. 空/未公布/无时间戳 → unknown
  if (!raw || EMPTY_RE.test(raw) || !ts) {
    return {
      state: "unknown",
      type,
      effectiveTs: null,
      confidence: 100,
      reason: "no-deadline",
      sourceRule: "NO_DEADLINE",
    };
  }

  // 2. 哨兵日期 → placeholder（不是真实的几十年后合同）
  if (SENTINEL_RE.test(raw)) {
    return {
      state: "placeholder",
      type,
      effectiveTs: null,
      confidence: 95,
      reason: "sentinel-deadline",
      sourceRule: `SENTINEL_${raw.slice(0, 10)}`,
    };
  }

  const year = utcParts(ts).y;
  const pub = parsePublished(input.publishedDate);
  // 用时间戳而不是年份做上限：2036-10-26 比「今天+10年」多 6 天，也应视为 suspect
  const far = ts > now + 315_360_000;
  const longAfterPub = pub ? year - pub.y > 10 : false;
  const near = monthDayNearPublished(ts, input.publishedDate);

  // 3. 框架类：30 年内视为真实框架结束日（不是一次性投标截止日）
  if (type === "framework_end") {
    if (year > nowYear + 30) {
      return {
        state: "placeholder",
        type,
        effectiveTs: null,
        confidence: 60,
        reason: "framework-far-future",
        sourceRule: "FRAMEWORK_FAR_FUTURE",
      };
    }
    return {
      state: "known",
      type,
      effectiveTs: ts,
      confidence: 70,
      reason: "framework-end",
      sourceRule: "FRAMEWORK_END", ...tzFields,
    };
  }

  // 4. 注册制 + 远年份 + 月日贴近发布日 → 年份笔误（巴西 PNCP 典型）
  if (type === "registration" && (far || longAfterPub) && near) {
    return {
      state: "typo_suspect",
      type,
      effectiveTs: null,
      confidence: 80,
      reason: "far-future-year-near-published",
      sourceRule: "REGISTRATION_YEAR_TYPO",
    };
  }

  // 5. 注册制 + 30 年内 → 真实注册制结束日
  if (type === "registration" && year <= nowYear + 30) {
    return {
      state: "known",
      type,
      effectiveTs: ts,
      confidence: 60,
      reason: "registration-end",
      sourceRule: "REGISTRATION_END", ...tzFields,
    };
  }

  // 6. 远年份 / 比发布年晚 10 年以上 → typo_suspect（不猜正确值）
  if (far || longAfterPub) {
    return {
      state: "typo_suspect",
      type,
      effectiveTs: null,
      confidence: near ? 80 : 50,
      reason: near ? "far-future-year-near-published" : "far-future-year",
      sourceRule: "FAR_FUTURE_YEAR",
    };
  }

  // 7. 正常
  return {
    state: "known",
    type,
    effectiveTs: ts,
    confidence: 100,
    reason: "ok",
    sourceRule: "OK", ...tzFields,
  };
}


