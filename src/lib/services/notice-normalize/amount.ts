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
  [/₹/i, "INR"], [/₽/i, "RUB"], [/₺/i, "TRY"], [/₴/i, "UAH"], [/zł/i, "PLN"], [/Kč/i, "CZK"],
  [/CHF/i, "CHF"], [/¥/i, "JPY"],
];
const COMMA_DECIMAL = new Set(["BR", "AR", "CL", "CO", "PE", "UY", "PY", "EC", "VE", "BO", "ES", "PT", "FR", "DE", "IT", "NL", "BE", "AT", "PL", "RU", "UA", "TR", "SE", "NO", "DK", "FI", "CZ", "SK", "HU", "RO", "BG", "HR", "RS", "GR", "ID", "VN"]);
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

function parseDecimal(token: string, countryCode?: string | null): { value: string; flags: string[] } | null {
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

function findAmount(text: string, countryCode?: string | null): { amount?: string; min?: string; max?: string; flags: string[]; confidence: number } {
  const flags: string[] = [];
  if (NONE_WORDS.test(text)) return { flags: ["amount_confidential_or_unknown"], confidence: 0 };
  if (/%|percent|per\s*cent|por\s*cento/i.test(text)) flags.push("percentage_not_total");
  const nums = [...text.matchAll(/\d[\d\s.,'’]*\d|\d/g)]
    .map((m) => m[0].trim())
    .filter((n) => n && !/^(19|20)\d{2}$/.test(n.replace(/[.,]/g, "")));
  if (nums.length === 0) return { flags: ["amount_missing"], confidence: 0 };
  const parsed = nums.map((n) => ({ raw: n, ...parseDecimal(n, countryCode) })).filter((x) => x.value) as Array<{ raw: string; value: string; flags: string[] }>;
  if (parsed.length === 0) return { flags: ["amount_unparseable"], confidence: 0 };
  const range = /\b(a|to|até|ate|hasta|à|–|-)\b/i.test(text) && parsed.length >= 2;
  if (range) {
    const vals = parsed.slice(0, 2).map((p) => p.value);
    return { min: vals[0], max: vals[1], flags: ["amount_range", ...parsed.flatMap((p) => p.flags)], confidence: 60 };
  }
  const first = parsed[0];
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
  const amt = findAmount(text, opts.countryCode);
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

