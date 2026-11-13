/**
 * 源站日期文本统一识别器（纯函数，全仓唯一实现）——2026-11-13 三套解析器收敛。
 *
 * 背景：同一句「源文本 → 时间」曾有三套各自为政的实现，格式覆盖不同、时区语义不同，
 * 同一字符串在不同层给出不同答案（2026-11-13 修的 43 行坏 deadline_ts 即其产物）。
 * 本模块把「识别」收敛为唯一一份，把「策略」留给调用方——三个内置 profile 逐一对应
 * 旧实现，用于阶段 1+2 的**零行为变更**接入（金样回归 zero-diff）：
 *
 *   classify（notice-deadline/classify.ts）  显式偏移换算进 ts，timezone/timezoneSource 溯源
 *   display （notice-datetime/parse.ts）     墙上时间，偏移一律忽略，午夜视为无真实时刻
 *   build   （notice-public/build.ts toEpoch）宽入口径：数字串、Date.parse 兜底、残尾忽略
 *
 * 支持格式（识别为并集，策略分层）：
 *   1. 数字串/数字：10~13 位，>1e11 视为毫秒（仅 numeric profile）
 *   2. ISO：YYYY-MM-DD [T/space hh:mm[:ss] [AM/PM]] [时区标注]
 *   3. 英文：D-Mon[-/space]YYYY（月名取前 3 字母），时刻/时区同上
 *   4. 斜杠：A/B/YYYY，一方 >12 才消歧；歧义且 fallback 时交 Date.parse（仅 build）
 *   5. 时区标注：`(GMT -4.00)` / `GMT+2` / `UTC+02:00` / `UTC+1200` / 尾部 ±HH[:?]MM /
 *      `Z`——数字偏移被提取为 offsetMinutes，纯标注（如 `(GMT)`）只剥离不换算
 *   6. 兜底：以上全失败且 fallback → Date.parse
 *
 * 不做：月>12 / 日>31 一律 null（不靠 Date.UTC 归一化）；空/纯空白返回 null；绝不臆造。
 *
 * ⚠️ 三个 legacy 选项（meridiem / isoHour=2 / dmonTime="drop"）只为复刻旧实现的口径差异，
 *    每条都注明影响的真实样本量。阶段 3（数据口径统一 + 重建 published_ts）应逐条退役，
 *    退役后本模块只剩「识别」与「偏移策略」两件事。
 */
export type SourceDateVia = "numeric" | "iso" | "dmon" | "slash" | "fallback";
export type SourceDateLeftover = "ignore" | "reject";

export interface SourceDateParts {
  /** 公历字段；mo 1~12（与 Date.UTC 对接时 -1） */
  y: number;
  mo: number;
  d: number;
  /** 时刻：null = 纯日期（源无时分）；mi/s 恒为数值 */
  h: number | null;
  mi: number;
  s: number;
  /** 显式数字偏移（分钟，东正西负）；纯标注/Z 以外无数字偏移时为 null */
  offsetMinutes: number | null;
  /** 是否出现可换算的显式偏移（含 Z=0）；纯标注剥离不算 */
  hasExplicitOffset: boolean;
  /** 时区标注归一后的标签（如 GMT+01:00 / UTC）；无标注为 null */
  tzLabel: string | null;
  via: SourceDateVia;
}

export interface SourceDateProfile {
  /** 数字串/数字直取（旧 toEpoch 行为） */
  numeric?: boolean;
  /** Date.parse 兜底（旧 toEpoch 行为） */
  fallback?: boolean;
  /** 残尾策略：ignore=取前缀（classify/toEpoch）；reject=整串必须吃完（display） */
  leftover?: SourceDateLeftover;
  /** 是否让 AM/PM 参与换算；false 时按 24h 直读（旧 classify/toEpoch 不认 AM/PM） */
  meridiem?: boolean;
  /**
   * ISO 时刻的小时位数：1=接受 1~2 位（display）；2=只认 2 位（旧 classify / toEpoch）。
   * 旧实现的 ISO 分支都写死 `(\d{2})`，只有 D-Mon 分支是 1~2 位——故本项只作用于 ISO。
   * 例：`2026-08-20 2:00:00 PM` 在 classify/toEpoch 里只取日期、丢时刻（**26 条真实样本**）。
   */
  isoHour?: 1 | 2;
  /** D-Mon 允许的分隔符集合（连字符须在首位，避免被当成区间） */
  dmonSeparators?: string;
  /** 是否识别 A/B/YYYY（旧 toEpoch 独有） */
  slashDate?: boolean;
  /**
   * D-Mon 的时刻处理：keep=保留（classify/display）；drop=丢弃、只取日期（旧 toEpoch）。
   * 旧 toEpoch 的 D-Mon 正则根本不抓时刻——**1188/1476 条真实样本**受影响，
   * 是阶段 3 最该先修的一条口径。
   */
  dmonTime?: "keep" | "drop";
}

/** 三个内置 profile：名字即消费方，改动须同步金样测试 */
export const SOURCE_DATE_PROFILES = {
  /** notice-deadline/classify.ts：截止时间分类（显式偏移要换算） */
  classify: {
    leftover: "ignore",
    meridiem: false,
    isoHour: 2,
    dmonSeparators: "-/ ",
    slashDate: false,
    dmonTime: "keep",
  },
  /** notice-datetime/parse.ts：展示层严格解析（墙上时间、残尾拒绝） */
  display: {
    leftover: "reject",
    meridiem: true,
    isoHour: 1,
    dmonSeparators: "-",
    slashDate: false,
    dmonTime: "keep",
  },
  /** notice-public/build.ts toEpoch：构建宽入口径 */
  build: {
    numeric: true,
    fallback: true,
    leftover: "ignore",
    meridiem: false,
    isoHour: 2,
    dmonSeparators: "-/ ",
    slashDate: true,
    dmonTime: "drop",
  },
} as const satisfies Record<string, SourceDateProfile>;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 时刻核心：hh:mm[:ss] 可带 AM/PM；返回 null=无时刻，undefined=残串非法 */
function parseTimeCore(
  s: string,
  meridiem: boolean,
): { h: number; mi: number; sec: number } | null | undefined {
  if (s === "") return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/i.exec(s);
  if (!m) return undefined;
  let h = Number(m[1]);
  const mi = Number(m[2]);
  const sec = m[3] ? Number(m[3]) : 0;
  const mer = m[4]?.toUpperCase();
  if (mi > 59 || sec > 59) return undefined;
  if (mer && meridiem) {
    if (h < 1 || h > 12) return undefined;
    h = mer === "AM" ? (h === 12 ? 0 : h) : h === 12 ? 12 : h + 12;
  } else if (h > 23) {
    return undefined;
  }
  return { h, mi, sec };
}

/**
 * 时区标注识别（在整串上找，找到即从串中剥离）。
 * 优先级沿用 classify 旧序：GMT/UTC 数字偏移（可在括号内）→ 尾部 ±HH[:?]MM → Z。
 * 数字偏移支持 `+2` / `+02:00` / `-4.00` / `+1200`（紧凑四位，旧 parse 支持）。
 * 纯标注（无数字，如 `(GMT)`）只剥离：offsetMinutes=null、hasExplicitOffset=false。
 */
function extractTz(raw: string): {
  rest: string;
  offsetMinutes: number | null;
  hasExplicitOffset: boolean;
  tzLabel: string | null;
} {
  // 1) 括号态：`(GMT -4.00)` / `(UTC+02:00)` / `(GMT)` / `(TZ ...)`
  //    整组消费，避免留下空括号让 reject 策略误判残尾。
  let m = /\s*\(\s*(?:GMT|UTC|UT|TZ)\b([^)]*)\)/i.exec(raw);
  if (m) {
    const rest = (raw.slice(0, m.index) + raw.slice(m.index + m[0].length)).trim();
    const inner = m[1].trim();
    const off = /^([+-]?\d{1,2})(?:[.:]\s*(\d{1,2})|\s*(\d{2}))?$/.exec(inner);
    if (off) {
      const sign = off[1].startsWith("-") ? -1 : 1;
      const h = Math.abs(Number(off[1]));
      const mm = Number(off[2] ?? off[3] ?? 0);
      const offsetMinutes = sign * (h * 60 + mm);
      return {
        rest,
        offsetMinutes,
        hasExplicitOffset: true,
        tzLabel: `GMT${offsetMinutes < 0 ? "-" : "+"}${pad2(h)}:${pad2(mm)}`,
      };
    }
    // 纯标注（无数字偏移）只剥离
    return { rest, offsetMinutes: null, hasExplicitOffset: false, tzLabel: null };
  }

  // 2) 裸 GMT/UTC + 数字偏移（任意位置）
  m = /(?:GMT|UTC)\s*([+-]?\d{1,2})(?:[.:]\s*(\d{1,2})|\s*(\d{2}))?/i.exec(raw);
  if (m) {
    const sign = m[1].startsWith("-") ? -1 : 1;
    const h = Math.abs(Number(m[1]));
    const mm = Number(m[2] ?? m[3] ?? 0);
    const offsetMinutes = sign * (h * 60 + mm);
    return {
      rest: (raw.slice(0, m.index) + raw.slice(m.index + m[0].length)).trim(),
      offsetMinutes,
      hasExplicitOffset: true,
      tzLabel: `GMT${offsetMinutes < 0 ? "-" : "+"}${pad2(h)}:${pad2(mm)}`,
    };
  }

  // 3) 尾部 ±HH[:?]MM
  //    前置必须是数字/冒号/空白：否则 `05-Feb-2026` 的 `-2026` 会被误认成 -20:26 偏移
  //    （旧 parse 只在「日期之后的残余串」上做这一步，天然不会吃到年份）。
  m = /(?<=[\d:\s])([+-])(\d{2}):?(\d{2})\s*$/.exec(raw);
  if (m) {
    const sign = m[1] === "-" ? -1 : 1;
    const h = Number(m[2]);
    const mm = Number(m[3]);
    return {
      rest: (raw.slice(0, m.index) + raw.slice(m.index + m[0].length)).trim(),
      offsetMinutes: sign * (h * 60 + mm),
      hasExplicitOffset: true,
      tzLabel: `GMT${m[1]}${m[2]}:${m[3]}`,
    };
  }

  // 4) Z 后缀（UTC 零偏移）
  m = /Z\s*$/i.exec(raw);
  if (m) {
    return {
      rest: raw.slice(0, m.index).trim(),
      offsetMinutes: 0,
      hasExplicitOffset: true,
      tzLabel: "UTC",
    };
  }

  // 5) 裸 UTC/GMT/UT 词（无数字偏移）：只剥离
  m = /\s*(?:UTC|GMT|UT)\s*$/i.exec(raw);
  if (m) return { rest: raw.slice(0, m.index).trim(), offsetMinutes: null, hasExplicitOffset: false, tzLabel: null };

  return { rest: raw, offsetMinutes: null, hasExplicitOffset: false, tzLabel: null };
}

function fromNumeric(n: number): SourceDateParts {
  const ts = n > 1e11 ? Math.floor(n / 1000) : Math.floor(n);
  const dt = new Date(ts * 1000);
  return {
    y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate(),
    h: dt.getUTCHours(), mi: dt.getUTCMinutes(), s: dt.getUTCSeconds(),
    offsetMinutes: null, hasExplicitOffset: false, tzLabel: null, via: "numeric",
  };
}

/**
 * 识别结果的「墙上时间」秒数（不换算偏移）。
 * classify 需要换算时自行减去 offsetMinutes*60；display/build 直接用本值。
 */
export function sourceDateWallSeconds(p: SourceDateParts): number {
  return Math.floor(Date.UTC(p.y, p.mo - 1, p.d, p.h ?? 0, p.mi, p.s) / 1000);
}

// ── 正则按 profile 编译并缓存（toEpoch 在构建期按行调用，不能每次 new RegExp） ──
interface CompiledRe {
  iso: RegExp;
  dmon: RegExp;
  slash: RegExp | null;
}
const reCache = new Map<string, CompiledRe>();

function compile(p: Required<SourceDateProfile>): CompiledRe {
  const key = `${p.leftover}|${p.isoHour}|${p.dmonSeparators}|${p.slashDate}`;
  const hit = reCache.get(key);
  if (hit) return hit;

  const isoHh = p.isoHour === 2 ? "(\\d{2})" : "(\\d{1,2})";
  // D-Mon 分支两种旧实现（classify / toEpoch）都是 1~2 位小时，固定
  const dmonHh = "(\\d{1,2})";
  const isoTime = `(?:[T\\s]+${isoHh}:(\\d{2})(?::(\\d{2}))?(?:\\s*([AP]M))?)?`;
  const dmonTimeRe = `(?:[T\\s]+${dmonHh}:(\\d{2})(?::(\\d{2}))?(?:\\s*([AP]M))?)?`;
  const tail = p.leftover === "ignore" ? "" : "\\s*$";
  // 连字符放首位，避免和「/ 空格」构成字符区间
  const sepChars = p.dmonSeparators.includes("-")
    ? "-" + p.dmonSeparators.replace(/-/g, "")
    : p.dmonSeparators;
  const sep = `[${sepChars}]`;
  const iso = new RegExp(`^(\\d{4})-(\\d{2})-(\\d{2})${isoTime}${tail}`, "i");
  const dmon = new RegExp(`^(\\d{1,2})${sep}([A-Za-z]{3,9})${sep}(\\d{4})${dmonTimeRe}${tail}`, "i");
  const slash = p.slashDate ? new RegExp(`^(\\d{1,2})/(\\d{1,2})/(\\d{4})${tail}`) : null;

  const compiled = { iso, dmon, slash };
  reCache.set(key, compiled);
  return compiled;
}

/**
 * 唯一识别器：源文本/数字 → 日历字段 + 时区溯源。
 * 解析不了返回 null（不猜、不臆造、不靠 Date.UTC 归一化无效日期）。
 */
export function parseSourceDateParts(
  raw: string | number | null | undefined,
  profile: SourceDateProfile = {},
): SourceDateParts | null {
  const p: Required<SourceDateProfile> = {
    numeric: profile.numeric ?? false,
    fallback: profile.fallback ?? false,
    leftover: profile.leftover ?? "reject",
    meridiem: profile.meridiem ?? false,
    isoHour: profile.isoHour ?? 1,
    dmonSeparators: profile.dmonSeparators ?? "-/ ",
    slashDate: profile.slashDate ?? false,
    dmonTime: profile.dmonTime ?? "keep",
  };

  if (typeof raw === "number") {
    return p.numeric && Number.isFinite(raw) && raw > 0 ? fromNumeric(raw) : null;
  }
  if (raw == null) return null;
  const input = raw.trim();
  if (!input) return null;

  if (p.numeric && /^\d{10,13}$/.test(input)) {
    return fromNumeric(Number(input));
  }

  const tz = extractTz(input);
  const body = tz.rest;
  const { iso: isoRe, dmon: dmonRe, slash: slashRe } = compile(p);

  const build = (y: number, mo: number, d: number, m: RegExpExecArray, via: SourceDateVia) => {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    // ISO 与 D-Mon 的时刻捕获组位置一致：4=hh 5=mm 6=ss 7=AM/PM
    const t = m[4] != null
      ? parseTimeCore(`${m[4]}:${m[5]}${m[6] ? `:${m[6]}` : ""}${m[7] ? ` ${m[7]}` : ""}`, p.meridiem)
      : null;
    if (t === undefined) return null;
    const dropDmonTime = via === "dmon" && p.dmonTime === "drop";
    const h = dropDmonTime ? null : t?.h ?? null;
    return {
      y, mo, d,
      h,
      mi: dropDmonTime ? 0 : t?.mi ?? 0,
      s: dropDmonTime ? 0 : t?.sec ?? 0,
      offsetMinutes: tz.offsetMinutes,
      hasExplicitOffset: tz.hasExplicitOffset,
      tzLabel: tz.tzLabel,
      via,
    };
  };

  let m = isoRe.exec(body);
  if (m) return build(Number(m[1]), Number(m[2]), Number(m[3]), m, "iso");

  m = dmonRe.exec(body);
  if (m) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (!mo) return null;
    return build(Number(m[3]), mo, Number(m[1]), m, "dmon");
  }

  m = slashRe?.exec(body) ?? null;
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]);
    if (a > 12 || b > 12) {
      const d = a > 12 ? a : b;
      const mo = a > 12 ? b : a;
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
      return {
        y, mo, d, h: null, mi: 0, s: 0,
        offsetMinutes: tz.offsetMinutes,
        hasExplicitOffset: tz.hasExplicitOffset,
        tzLabel: tz.tzLabel,
        via: "slash",
      };
    }
    // A/B 均 ≤12 的歧义斜杠：交由 fallback（Date.parse，MM/DD 口径）裁决
  }

  if (p.fallback) {
    const parsed = Date.parse(input);
    if (Number.isFinite(parsed)) {
      const parts = fromNumeric(Math.floor(parsed / 1000));
      return { ...parts, via: "fallback" };
    }
  }
  return null;
}
