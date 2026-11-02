/**
 * 金额归一化：只解析“公告原文写了多少、什么货币”，不做汇率换算、不猜价格。
 *
 * 原则：
 * - 原文有明确币种/符号 → 用原文；没有就 currency=null，并打 flag，不拿默认 CNY 冒充。
 * - 保留 raw 原文；amount 用十进制字符串，最终落 DECIMAL(20,2)。
 * - 范围/多个金额/百分比/单位价 → 不硬填单值，打 flag。
 */
export interface NormalizedAmount {
  raw: string | null;
  amount: string | null;
  min: string | null;
  max: string | null;
  currency: string | null;
  currencySource: "explicit" | "column" | "inferred" | "none";
  confidence: number;
  flags: string[];
}

const CODES = new Set(`AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BOV BRL BSD BTN BWP BYN BZD CAD CDF CHE CHF CHW CLF CLP CNY COP COU CRC CUC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HRK HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SLL SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD USN UYI UYU UYW UZS VED VES VND VUV WST XAF XAG XAU XBA XBB XBC XBD XCD XDR XOF XPD XPF XPT XSU XTS XUA YER ZAR ZMW ZWL`.split(" "));
const SYMBOLS: Array<[RegExp, string]> = [
  [/R\$/i, "BRL"], [/US\$/i, "USD"], [/C\$/i, "CAD"], [/A\$/i, "AUD"], [/NZ\$/i, "NZD"],
  [/S\$/i, "SGD"], [/HK\$/i, "HKD"], [/NT\$/i, "TWD"], [/€/i, "EUR"], [/£/i, "GBP"],
  [/₹/i, "INR"], [/₱/i, "PHP"], [/₩/i, "KRW"], [/￥/i, "CNY"], [/₽/i, "RUB"], [/₺/i, "TRY"], [/₴/i, "UAH"], [/zł/i, "PLN"], [/Kč/i, "CZK"],
  [/CHF/i, "CHF"], [/¥/i, "JPY"],
];
// 小数点/千分位不再按国家白名单判定（旧 COMMA_DECIMAL 集合）：下面 parseDecimal 用结构规则
// （分隔符个数 + 尾段长度）定千分位/小数，模糊处一律打 separator_assumed_thousands 标记，
// 不拿国家代码去猜——同一国家内两种写法都实测存在，猜出来的数字比标错更贵。
const COUNTRY_CURRENCY: Record<string, string> = {
  BR: "BRL", FR: "EUR", PH: "PHP", ET: "ETB", CL: "CLP", NZ: "NZD", PT: "EUR",
  PK: "PKR", GE: "GEL", GB: "GBP", CA: "CAD", NL: "EUR", KE: "KES", AU: "AUD",
  US: "USD", ZA: "ZAR", IN: "INR", UA: "UAH", PL: "PLN", ES: "EUR", DE: "EUR",
  IT: "EUR", BE: "EUR", AT: "EUR", IE: "EUR", FI: "EUR", GR: "EUR", SK: "EUR",
  SI: "EUR", LV: "EUR", LT: "EUR", EE: "EUR", LU: "EUR", MT: "EUR", CY: "EUR",
  MX: "MXN", CO: "COP", PE: "PEN", AR: "ARS", UY: "UYU", PY: "PYG",
  BO: "BOB", EC: "USD", VE: "VES", CR: "CRC", PA: "PAB", DO: "DOP", GT: "GTQ",
  HN: "HNL", SV: "USD", NI: "NIO", TR: "TRY", IL: "ILS", AE: "AED", SA: "SAR",
  QA: "QAR", KW: "KWD", BH: "BHD", OM: "OMR", JO: "JOD", EG: "EGP", MA: "MAD",
  NG: "NGN", GH: "GHS", TZ: "TZS", UG: "UGX", ZW: "ZWL", ZM: "ZMW", BW: "BWP",
  NA: "NAD", MZ: "MZN", AO: "AOA", SN: "XOF", CI: "XOF", CM: "XAF", CD: "CDF",
  CG: "XAF", RU: "RUB", KZ: "KZT", UZ: "UZS", BD: "BDT", LK: "LKR", NP: "NPR",
  MM: "MMK", TH: "THB", VN: "VND", ID: "IDR", MY: "MYR", SG: "SGD", HK: "HKD",
  TW: "TWD", KR: "KRW", JP: "JPY", CN: "CNY", CH: "CHF", SE: "SEK", NO: "NOK",
  DK: "DKK", CZ: "CZK", HU: "HUF", RO: "RON", BG: "BGN", HR: "EUR", RS: "RSD",
  MD: "MDL", AL: "ALL", MK: "MKD", BA: "BAM", XK: "EUR",
};
const NONE_WORDS = /(sigilos[oa]|confidencial|reservad[oa]|n[ãa]o\s+informad[oa]|nao\s+informad[oa]|not\s+informed|not\s+disclosed|to\s+be\s+confirmed|a\s+definir|a\s+confirmar|não\s+divulgado)/i;
const LABEL = /(valor\s+(?:estimado|global|total|m[áa]ximo|m[áa]ximo|de\s+refer[êe]ncia)|estimated\s+(?:value|budget|total)|budget(?:\s+estimate)?|contract\s+value|montante|vlr\.?\s*estimado|importe\s+estimado|pre[çc]o\s+estimado)/i;

function detectCurrency(text: string, hint?: unknown, countryCode?: string | null): { code: string | null; source: "explicit" | "column" | "inferred" | "none"; flags: string[] } {
  const flags: string[] = [];
  const upper = text.toUpperCase();
  const codeMatch = upper.match(/\b([A-Z]{3})\b/g)?.find((c) => CODES.has(c));
  if (codeMatch) return { code: codeMatch, source: "explicit", flags };
  for (const [re, code] of SYMBOLS) if (re.test(text)) return { code, source: "explicit", flags };
  // "US $120000" 空格变体（2026-10-31 从旧读路径并入）：SYMBOLS 的 US\$ 紧邻形接不住
  if (/US\s*\$/.test(text)) return { code: "USD", source: "explicit", flags };
  if (/\$/.test(text)) {
    const byCountry: Record<string, string> = { US: "USD", CA: "CAD", AU: "AUD", NZ: "NZD", SG: "SGD", HK: "HKD", TW: "TWD", MX: "MXN" };
    const code = countryCode ? byCountry[countryCode] : null;
    if (code) return { code, source: "inferred", flags: ["currency_inferred_from_country"] };
    flags.push("ambiguous_currency_symbol");
  }
  const h = String(hint ?? "").trim().toUpperCase();
  if (CODES.has(h)) {
    if (h === "CNY" && countryCode && countryCode !== "CN") {
      flags.push("currency_default_cny_ignored");
    } else {
      return { code: h, source: "column", flags };
    }
  }
  const inferred = countryCode ? COUNTRY_CURRENCY[countryCode] : undefined;
  if (inferred) {
    flags.push("currency_inferred_from_country");
    return { code: inferred, source: "inferred", flags };
  }
  flags.push("currency_unknown");
  return { code: null, source: "none", flags };
}

/** 结构式解析：靠分隔符个数与尾段长度定小数位，不需要国家码（模糊处只打 flag，不猜） */
function parseDecimal(token: string): { value: string; flags: string[] } | null {
  let t = token.replace(/[ \u00a0'’]/g, "");
  const flags: string[] = [];
  const hasDot = t.includes(".");
  const hasComma = t.includes(",");
  let decimal: "." | "," | null = null;
  if (hasDot && hasComma) {
    decimal = t.lastIndexOf(",") > t.lastIndexOf(".") ? "," : ".";
  } else if (hasComma || hasDot) {
    const sep = hasComma ? "," : ".";
    const parts = t.split(sep);
    if (parts.length > 2) {
      decimal = null; // 1.234.567 → thousands
    } else if (parts[1]?.length === 3) {
      decimal = null; // 1,234 / 1.234 → 千分位（金额总额更常见）
      flags.push("separator_assumed_thousands");
    } else {
      decimal = sep; // 1,23 / 1.2 → 小数
    }
  }
  if (decimal) {
    const dec = decimal;
    const other = dec === "." ? "," : ".";
    t = t.split(other).join("");
    const idx = t.lastIndexOf(dec);
    t = t.slice(0, idx).replace(new RegExp(`\\${dec}`, "g"), "") + "." + t.slice(idx + 1);
  } else {
    t = t.replace(/[.,]/g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [i, f = ""] = t.split(".");
  const value = `${i.replace(/^0+(?=\d)/, "") || "0"}.${(f + "00").slice(0, 2)}`;
  return { value, flags };
}

function findAmount(text: string): { amount?: string; min?: string; max?: string; flags: string[]; confidence: number } {
  const flags: string[] = [];
  if (NONE_WORDS.test(text)) return { flags: ["amount_confidential_or_unknown"], confidence: 0 };
  if (/%|percent|per\s*cent|por\s*cento/i.test(text)) flags.push("percentage_not_total");
  const nums = [...text.matchAll(/\d[\d\s.,'’]*\d|\d/g)]
    .map((m) => m[0].trim())
    .filter((n) => n && !/^(19|20)\d{2}$/.test(n.replace(/[.,]/g, "")));
  if (nums.length === 0) return { flags: ["amount_missing"], confidence: 0 };
  const parsed = nums.map((n) => ({ raw: n, ...parseDecimal(n) })).filter((x) => x.value) as Array<{ raw: string; value: string; flags: string[] }>;
  if (parsed.length === 0) return { flags: ["amount_unparseable"], confidence: 0 };
  const range = /\b(a|to|até|ate|hasta|à|–|-)\b/i.test(text) && parsed.length >= 2;
  if (range) {
    const vals = parsed.slice(0, 2).map((p) => p.value);
    return { min: vals[0], max: vals[1], flags: ["amount_range", ...parsed.flatMap((p) => p.flags)], confidence: 60 };
  }
  const first = parsed[0];
  // 防溢出闸（2026-10-31 从旧读路径 parser 并入）：≥1e15 视同缺失，DECIMAL(20,2) 装不下
  if (Number(first.value) >= 1e15) return { flags: [...flags, "amount_overflow"], confidence: 0 };
  return { amount: first.value, flags: [...flags, ...first.flags], confidence: flags.includes("percentage_not_total") ? 30 : 85 };
}

function scaleSuffix(amount: string, text: string): { amount: string; flags: string[] } {
  const m = /\b(milh[ãa]o|milh[õo]es|million|millions|bilh[ãa]o|bilh[õo]es|billion|bilion|bn|mil|thousand|k)\b/i.exec(text);
  if (!m) return { amount, flags: [] };
  const factor = /milh|million/i.test(m[1]) ? 1_000_000 : /bilh|billion|bilion|bn/i.test(m[1]) ? 1_000_000_000 : 1_000;
  const n = Number(amount) * factor;
  return { amount: n.toFixed(2), flags: ["amount_scaled_by_suffix"] };
}

export function normalizeAmount(rawValue: unknown, opts: { currencyHint?: unknown; countryCode?: string | null; description?: unknown } = {}): NormalizedAmount {
  const raw = String(rawValue ?? "").trim() || null;
  const description = String(opts.description ?? "");
  let text = raw ?? "";
  let sourceText = raw ? "field" : "description";
  if (!text) {
    const m = LABEL.exec(description);
    if (m) {
      text = description.slice(m.index, m.index + 160);
      sourceText = "description";
    }
  }
  if (!text) return { raw, amount: null, min: null, max: null, currency: null, currencySource: "none", confidence: 0, flags: ["amount_missing"] };
  const cur = detectCurrency(text, opts.currencyHint, opts.countryCode);
  // 金额字段本身没写币种时，再从正文找显式币种；不接受仅按国家推断
  let curFromDesc = cur;
  if (!cur.code && description && description !== text) {
    const d = detectCurrency(description, opts.currencyHint, opts.countryCode);
    if (d.code && d.source !== "inferred") curFromDesc = d;
  }
  const amt = findAmount(text);
  if (amt.amount) {
    const scaled = scaleSuffix(amt.amount, text);
    amt.amount = scaled.amount;
    amt.flags.push(...scaled.flags);
    if (Number(amt.amount) === 0) {
      amt.amount = undefined;
      amt.flags.push("amount_zero");
    }
  }
  const flags = [...new Set([...curFromDesc.flags, ...amt.flags])];
  if (sourceText === "description") flags.push("amount_from_description");
  if (!curFromDesc.code) flags.push("currency_unknown");
  if (!amt.amount && !amt.min) flags.push("amount_missing");
  let confidence = Math.min(amt.confidence, curFromDesc.code ? 95 : 70);
  if (curFromDesc.source === "inferred") confidence = Math.min(confidence, 70);
  if (flags.includes("amount_confidential_or_unknown")) confidence = 0;
  if (flags.includes("ambiguous_currency_symbol")) confidence = Math.min(confidence, 50);
  return { raw, amount: amt.amount ?? null, min: amt.min ?? null, max: amt.max ?? null, currency: curFromDesc.code, currencySource: curFromDesc.source, confidence, flags: [...new Set(flags)] };
}


// ── 读路径适配层（2026-10-31 金额解析器二合一）────────────────────────────────
// 旧 services/amount/parser.ts（推荐排序的 notice_amount_cache 供数方）已删除：
// 它自带第二份符号表/国家推断表/朴素正则小数判定，与写路径标准对同一原文会给出不同答案
// （真库对拍 2000 行：币种分歧 752 条 = 41%，全部是旧版在零线索时把任意 3 字母词/纯数字
// 硬安币种所致——"35200" 被判 EUR/UAH/BYN/MNT 纯看运气）。本适配是唯一合法出口：
// 写路径核解析 + 粗汇率折算，供推荐排序的跨币种数量级可比。

/** 粗粒度静态汇率（→USD）：仅用于推荐排序的数量级可比，不追求精确（沿用旧表精度口径） */
export const USD_RATE_ROUGH: Record<string, number> = {
  USD: 1, EUR: 1.08, GBP: 1.27, CNY: 0.14, JPY: 0.0067, BRL: 0.18, PHP: 0.017, INR: 0.012,
  IDR: 0.000063, VND: 0.00004, THB: 0.028, MYR: 0.22, KRW: 0.00072, RUB: 0.011, MXN: 0.055,
  CLP: 0.0011, COP: 0.00025, PEN: 0.27, ARS: 0.001, XOF: 0.0016, XAF: 0.0016, KES: 0.0072,
  NGN: 0.00065, ZAR: 0.053, EGP: 0.021, ETB: 0.008, TZS: 0.0004, UGX: 0.00027, GHS: 0.065,
  MAD: 0.1, DZD: 0.0074, TND: 0.32, PKR: 0.0036, BDT: 0.0085, LKR: 0.0031, NPR: 0.0074,
  MMK: 0.00048, KHR: 0.00025, LAK: 0.000045, AFN: 0.014, IQD: 0.00076, JOD: 1.41, SAR: 0.27,
  AED: 0.27, QAR: 0.27, KWD: 3.25, TRY: 0.03, UAH: 0.024, PLN: 0.25, RON: 0.22, HUF: 0.0026,
  CZK: 0.043, SEK: 0.095, NOK: 0.093, DKK: 0.145, CHF: 1.13, CAD: 0.73, AUD: 0.66, NZD: 0.61,
  HTG: 0.0076, DOP: 0.017, GTQ: 0.13, HNL: 0.04, NIO: 0.027, CRC: 0.0019, PAB: 1, BOB: 0.145,
  PYG: 0.00013, UYU: 0.025, SOS: 0.0018, SDG: 0.0017, SSP: 0.0008, YER: 0.004, SYP: 0.00008,
  LBP: 0.000011, MZN: 0.016, MWK: 0.00058, ZMW: 0.037, RWF: 0.00073, BIF: 0.00034, CDF: 0.00035,
  GNF: 0.00012, SLL: 0.000044, LRD: 0.0052, GMD: 0.014, MRU: 0.025, DJF: 0.0056, ERN: 0.067,
  UZS: 0.000079, KZT: 0.002, KGS: 0.011, TJS: 0.092, TMT: 0.29, AZN: 0.59, GEL: 0.37, AMD: 0.0025,
  MNT: 0.00029, BTN: 0.012, MVR: 0.065, FJD: 0.44, PGK: 0.25, SBD: 0.12, VUV: 0.0082,
  WST: 0.36, TOP: 0.42, HKD: 0.128, TWD: 0.031, SGD: 0.74, BND: 0.74, MOP: 0.124, ILS: 0.27,
  OMR: 2.6, BHD: 2.65, LYD: 0.21, ALL: 0.011, MKD: 0.0175, RSD: 0.0092, BAM: 0.55, BGN: 0.55,
  MDL: 0.056, BYN: 0.31, ISK: 0.0072, HRK: 0.143,
};

/** 中文币种名 → ISO（原读路径独有能力，合入后写路径同样白得；歧义词不收靠国家推断兜底） */
const CURRENCY_NAME_MAP: Record<string, string> = {
  "美元": "USD", "欧元": "EUR", "英镑": "GBP", "人民币": "CNY", "日元": "JPY",
  "巴西雷亚尔": "BRL", "雷亚尔": "BRL", "菲律宾比索": "PHP", "印度卢比": "INR", "印尼盾": "IDR",
  "越南盾": "VND", "泰铢": "THB", "韩元": "KRW", "卢布": "RUB", "墨西哥比索": "MXN",
  "智利比索": "CLP", "哥伦比亚比索": "COP", "阿根廷比索": "ARS", "南非兰特": "ZAR",
  "埃及镑": "EGP", "土耳其里拉": "TRY", "沙特里亚尔": "SAR", "迪拉姆": "AED", "港元": "HKD",
  "新台币": "TWD", "新加坡元": "SGD", "瑞士法郎": "CHF", "加元": "CAD", "澳元": "AUD",
};

/** 英文国名 → 法定货币（读路径适配专用：原 raw 的 country 列是英文名非码） */
const COUNTRY_NAME_CURRENCY: Record<string, string> = {
  brazil: "BRL", philippines: "PHP", india: "INR", indonesia: "IDR", vietnam: "VND", "viet nam": "VND",
  thailand: "THB", malaysia: "MYR", china: "CNY", japan: "JPY", korea: "KRW", mexico: "MXN",
  chile: "CLP", colombia: "COP", peru: "PEN", argentina: "ARS", kenya: "KES", nigeria: "NGN",
  "south africa": "ZAR", egypt: "EGP", ethiopia: "ETB", tanzania: "TZS", uganda: "UGX", ghana: "GHS",
  morocco: "MAD", algeria: "DZD", tunisia: "TND", pakistan: "PKR", bangladesh: "BDT", "sri lanka": "LKR",
  nepal: "NPR", myanmar: "MMK", cambodia: "KHR", lao: "LAK", afghanistan: "AFN", iraq: "IQD",
  jordan: "JOD", "saudi arabia": "SAR", "united arab emirates": "AED", qatar: "QAR", kuwait: "KWD",
  turkey: "TRY", ukraine: "UAH", poland: "PLN", romania: "RON", hungary: "HUF", czech: "CZK",
  sweden: "SEK", norway: "NOK", denmark: "DKK", switzerland: "CHF", canada: "CAD", australia: "AUD",
  "new zealand": "NZD", haiti: "HTG", "dominican republic": "DOP", guatemala: "GTQ", honduras: "HNL",
  nicaragua: "NIO", "costa rica": "CRC", panama: "PAB", bolivia: "BOB", paraguay: "PYG", uruguay: "UYU",
  somalia: "SOS", sudan: "SDG", "south sudan": "SSP", yemen: "YER", syria: "SYP", lebanon: "LBP",
  mozambique: "MZN", malawi: "MWK", zambia: "ZMW", rwanda: "RWF", burundi: "BIF", congo: "CDF",
  guinea: "GNF", "sierra leone": "SLL", liberia: "LRD", gambia: "GMD", mauritania: "MRU",
  djibouti: "DJF", eritrea: "ERN", uzbekistan: "UZS", kazakhstan: "KZT", kyrgyzstan: "KGS",
  tajikistan: "TJS", turkmenistan: "TMT", azerbaijan: "AZN", georgia: "GEL", armenia: "AMD",
  mongolia: "MNT", bhutan: "BTN", maldives: "MVR", fiji: "FJD", "papua new guinea": "PGK",
  "united states": "USD", ecuador: "USD", "el salvador": "USD", timor: "USD", singapore: "SGD",
  israel: "ILS", oman: "OMR", bahrain: "BHD", libya: "LYD", albania: "ALL", "north macedonia": "MKD",
  serbia: "RSD", bosnia: "BAM", bulgaria: "BGN", moldova: "MDL", belarus: "BYN", iceland: "ISK",
  "united kingdom": "GBP", france: "EUR", germany: "EUR", italy: "EUR", spain: "EUR", portugal: "EUR",
  netherlands: "EUR", belgium: "EUR", austria: "EUR", greece: "EUR", finland: "EUR", ireland: "EUR",
};

export interface ParsedAmountUsd {
  amount: number | null;
  currency: string | null;
  amountUsd: number | null;
  inferred: boolean;
}

/**
 * 读路径解析入口（推荐金额缓存供数专用）：核心 normalizeAmount + 粗汇率折算。
 * 关键差异 vs 旧 parser：零线索时 currency=null / amountUsd=null（评分侧取中性 0.5），
 * 绝不把任意 3 字母词当币种瞎猜——宁可 NULL 不可错值（错值直接污染金额偏好中心点）。
 * 中文币种名/英文国名两条识别路径在此补齐（核解析的 country 入参是 ISO 码，读路径拿到的是国名）。
 */
export function parseAmountUsd(raw: unknown, countryName?: unknown): ParsedAmountUsd {
  const text = String(raw ?? "");
  // 核心的国家推断入参是 ISO 码；读路径拿到的是英文国名——核心先不传国家（避免错维度），
  // 国名→币种在本适配层直接查 COUNTRY_NAME_CURRENCY（与核心 ISO 表同精度、不同键制）。
  const cname = String(countryName ?? "").trim().toLowerCase();
  const core = normalizeAmount(text, { description: text });
  let currency = core.currency;
  let inferred = false;
  // 中文币种名（核心识别不含中文；读路径原文常见）补齐
  if (!currency) {
    for (const [name, iso] of Object.entries(CURRENCY_NAME_MAP)) {
      if (text.includes(name)) { currency = iso; break; }
    }
  }
  // 英文国名推断（last resort，与核心 inferred 语义一致）
  if (!currency && cname) {
    for (const [name, iso] of Object.entries(COUNTRY_NAME_CURRENCY)) {
      if (cname.includes(name)) { currency = iso; inferred = true; break; }
    }
  }
  // 区间：核心保留 min/max 不硬取单值；读路径排序需要单值 → 取中位（旧读路径同口径）
  let amount = core.amount != null ? Number(core.amount) : null;
  if (amount == null && core.min != null && core.max != null) {
    amount = Math.round(((Number(core.min) + Number(core.max)) / 2) * 100) / 100;
  }
  const rate = currency ? USD_RATE_ROUGH[currency] : undefined;
  const amountUsd = amount != null && rate != null ? Math.round(amount * rate * 100) / 100 : null;
  if (!currency) inferred = true; // 零线索：评分侧取中性 0.5
  return { amount, currency, amountUsd, inferred };
}
