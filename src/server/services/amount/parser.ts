/**
 * 金额解析器
 * Amount Parser
 *
 * @module server/services/amount/parser
 * @description 本地差异 #10：T-B3 金额解析（D.3.2 四步规则：垃圾过滤 → 币种识别 → 数字提取/区间取中位 → country 推断）
 *
 *              estimated_value 实测形态（2026-07-29 只读探针）：notices 侧 56% 纯数字 + 43% "BRL 173,841.36" 式；
 *              opportunities 侧含"未提及/Not specified"类垃圾文本、"6666.67 php" 小写后缀、"菲律宾比索"中文名、区间。
 */
import "server-only";

export const AMOUNT_PARSE_VERSION = 1;

// 粗粒度静态汇率（→USD）：仅用于跨币种数量级可比，不追求精确；调整后须递增 AMOUNT_PARSE_VERSION 触发重算
const USD_RATE: Record<string, number> = {
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

// 中文币种名 → ISO（三写法之一；"比索/卢比/第纳尔"等歧义词不收，靠 country 推断兜底）
const CURRENCY_NAME_MAP: Record<string, string> = {
  "美元": "USD", "欧元": "EUR", "英镑": "GBP", "人民币": "CNY", "日元": "JPY",
  "巴西雷亚尔": "BRL", "雷亚尔": "BRL", "菲律宾比索": "PHP", "印度卢比": "INR", "印尼盾": "IDR",
  "越南盾": "VND", "泰铢": "THB", "韩元": "KRW", "卢布": "RUB", "墨西哥比索": "MXN",
  "智利比索": "CLP", "哥伦比亚比索": "COP", "阿根廷比索": "ARS", "南非兰特": "ZAR",
  "埃及镑": "EGP", "土耳其里拉": "TRY", "沙特里亚尔": "SAR", "迪拉姆": "AED", "港元": "HKD",
  "新台币": "TWD", "新加坡元": "SGD", "瑞士法郎": "CHF", "加元": "CAD", "澳元": "AUD",
};

// 国家名（英文小写包含匹配）→ 法定货币：country 推断路径，打 inferred 标记（评分信心收缩 ×0.7）
const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  brazil: "BRL", philippines: "PHP", india: "INR", indonesia: "IDR", "viet nam": "VND", vietnam: "VND",
  thailand: "THB", malaysia: "MYR", china: "CNY", japan: "JPY", "korea": "KRW", mexico: "MXN",
  chile: "CLP", colombia: "COP", peru: "PEN", argentina: "ARS", kenya: "KES", nigeria: "NGN",
  "south africa": "ZAR", egypt: "EGP", ethiopia: "ETB", tanzania: "TZS", uganda: "UGX", ghana: "GHS",
  morocco: "MAD", algeria: "DZD", tunisia: "TND", pakistan: "PKR", bangladesh: "BDT", "sri lanka": "LKR",
  nepal: "NPR", myanmar: "MMK", cambodia: "KHR", "lao": "LAK", afghanistan: "AFN", iraq: "IQD",
  jordan: "JOD", "saudi arabia": "SAR", "united arab emirates": "AED", qatar: "QAR", kuwait: "KWD",
  turkey: "TRY", ukraine: "UAH", poland: "PLN", romania: "RON", hungary: "HUF", "czech": "CZK",
  sweden: "SEK", norway: "NOK", denmark: "DKK", switzerland: "CHF", canada: "CAD", australia: "AUD",
  "new zealand": "NZD", haiti: "HTG", "dominican republic": "DOP", guatemala: "GTQ", honduras: "HNL",
  nicaragua: "NIO", "costa rica": "CRC", panama: "PAB", bolivia: "BOB", paraguay: "PYG", uruguay: "UYU",
  somalia: "SOS", sudan: "SDG", "south sudan": "SSP", yemen: "YER", syria: "SYP", lebanon: "LBP",
  mozambique: "MZN", malawi: "MWK", zambia: "ZMW", rwanda: "RWF", burundi: "BIF", congo: "CDF",
  guinea: "GNF", "sierra leone": "SLL", liberia: "LRD", gambia: "GMD", mauritania: "MRU",
  djibouti: "DJF", eritrea: "ERN", uzbekistan: "UZS", kazakhstan: "KZT", kyrgyzstan: "KGS",
  tajikistan: "TJS", turkmenistan: "TMT", azerbaijan: "AZN", georgia: "GEL", armenia: "AMD",
  mongolia: "MNT", bhutan: "BTN", maldives: "MVR", fiji: "FJD", "papua new guinea": "PGK",
  "united states": "USD", "ecuador": "USD", "el salvador": "USD", "timor": "USD", singapore: "SGD",
  israel: "ILS", oman: "OMR", bahrain: "BHD", libya: "LYD", albania: "ALL", "north macedonia": "MKD",
  serbia: "RSD", bosnia: "BAM", bulgaria: "BGN", moldova: "MDL", belarus: "BYN", iceland: "ISK",
  "united kingdom": "GBP", france: "EUR", germany: "EUR", italy: "EUR", spain: "EUR", portugal: "EUR",
  netherlands: "EUR", belgium: "EUR", austria: "EUR", greece: "EUR", finland: "EUR", ireland: "EUR",
};

/**
 * 解析公告预估金额
 *
 * @param raw - 原始金额字符串
 * @param country - 国家名（用于推断币种）
 * @returns 解析结果，包含金额、币种、美元等值、是否推断
 */
export function parseEstimatedValue(
  raw: unknown,
  country?: unknown
): { amount: number; currency: string | null; amountUsd: number | null; inferred: boolean } | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  // 步骤 1：垃圾过滤——不含数字直接判不可解析（"未提及/Not specified/待补充"等实测高频垃圾文本）
  if (!/[0-9]/.test(text)) return null;

  // 步骤 3（先提数字再定币种，互不依赖）：去千分位逗号后提取；区间（-/~/至/to）取中位
  const cleaned = text.replace(/(\d),(?=\d{3}(\D|$))/g, "$1");
  const nums = (cleaned.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((v) => Number.isFinite(v) && v > 0);
  if (nums.length === 0) return null; // 全是 0 或无有效数字（"0" 实测 2021 行，视同缺失）
  const isRange = nums.length >= 2 && /\d[\s,.]*(?:-|~|—|～|至|to)\s*[\d]/i.test(cleaned);
  let amount = isRange ? (nums[0] + nums[1]) / 2 : nums[0];
  if (amount >= 1e15) return null; // 防脏数据溢出 DECIMAL(20,2)
  amount = Math.round(amount * 100) / 100;

  // 步骤 2：币种识别（三写法：ISO 代码大小写 / 中文币种名 / 货币符号）
  let currency: string | null = null;
  const isoMatch = text.match(/\b([A-Za-z]{3})\b/);
  if (isoMatch && USD_RATE[isoMatch[1].toUpperCase()]) currency = isoMatch[1].toUpperCase();
  if (!currency) {
    for (const [name, iso] of Object.entries(CURRENCY_NAME_MAP)) {
      if (text.includes(name)) { currency = iso; break; }
    }
  }
  if (!currency) {
    if (/US\s*\$/.test(text)) currency = "USD";
    else if (text.includes("€")) currency = "EUR";
    else if (text.includes("£")) currency = "GBP";
    else if (/R\$/i.test(text)) currency = "BRL";
    else if (text.includes("¥") || text.includes("￥")) currency = "CNY";
    else if (text.includes("₱")) currency = "PHP";
    else if (text.includes("₹")) currency = "INR";
    else if (text.includes("₩")) currency = "KRW";
  }

  // 步骤 4：country 推断币种（inferred 标记，评分时向中性收缩 ×0.7）；无 country 线索则币种 NULL、
  // amount_usd NULL——评分侧对 NULL 一律取中性 0.5（不奖不罚）
  let inferred = false;
  if (!currency) {
    const c = String(country || "").toLowerCase();
    if (c) {
      for (const [name, iso] of Object.entries(COUNTRY_CURRENCY_MAP)) {
        if (c.includes(name)) { currency = iso; inferred = true; break; }
      }
    }
    if (!currency) inferred = true;
  }
  const rate = currency ? USD_RATE[currency] : undefined;
  const amountUsd = rate ? Math.round(amount * rate * 100) / 100 : null;
  return { amount, currency, amountUsd, inferred };
}
