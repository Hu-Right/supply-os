/**
 * 国家/地区代码与本地化名称（ISO 3166-1 alpha-2）
 *
 * @module shared/constants/countries
 * @description 业务只存 ISO 代码（CN/US/KE），展示时按当前语言转名称，避免
 *              “中国 / China / CN / 中华人民共和国”多种写法并存。
 *              名称由 Intl.DisplayNames 生成（运行时内置，不依赖外部数据源）。
 */

/** ISO 3166-1 alpha-2（排除已废弃/保留码，保留 XK 科索沃） */
export const COUNTRY_CODES = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS",
  "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN",
  "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE",
  "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF",
  "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM",
  "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM",
  "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC",
  "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK",
  "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA",
  "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG",
  "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS",
  "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO",
  "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI",
  "VN", "VU", "WF", "WS", "XK", "YE", "YT", "ZA", "ZM", "ZW",
] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

const COUNTRY_SET = new Set<string>(COUNTRY_CODES);

/** 常见中文/英文写法 → 代码（存量文本回填与旧数据兼容） */
const ALIASES: Record<string, string> = {
  中国: "CN",
  中华人民共和国: "CN",
  china: "CN",
  美国: "US",
  usa: "US",
  "united states": "US",
  英国: "GB",
  uk: "GB",
  "united kingdom": "GB",
  德国: "DE",
  germany: "DE",
  法国: "FR",
  france: "FR",
  日本: "JP",
  japan: "JP",
  韩国: "KR",
  南韩: "KR",
  "south korea": "KR",
  肯尼亚: "KE",
  kenya: "KE",
  尼日利亚: "NG",
  nigeria: "NG",
  南非: "ZA",
  "south africa": "ZA",
  阿联酋: "AE",
  阿联酋长国: "AE",
  uae: "AE",
  "united arab emirates": "AE",
  沙特: "SA",
  沙特阿拉伯: "SA",
  "saudi arabia": "SA",
  印度: "IN",
  india: "IN",
  巴西: "BR",
  brazil: "BR",
  墨西哥: "MX",
  mexico: "MX",
  俄罗斯: "RU",
  russia: "RU",
  土耳其: "TR",
  turkey: "TR",
  印度尼西亚: "ID",
  印尼: "ID",
  indonesia: "ID",
  马来西亚: "MY",
  malaysia: "MY",
  泰国: "TH",
  thailand: "TH",
  越南: "VN",
  vietnam: "VN",
  菲律宾: "PH",
  philippines: "PH",
  澳大利亚: "AU",
  australia: "AU",
  加拿大: "CA",
  canada: "CA",
  新加坡: "SG",
  singapore: "SG",
  香港: "HK",
  "hong kong": "HK",
  台湾: "TW",
  taiwan: "TW",
  // ── 2026-11-25 补齐：country_aliases 的标准名里，这 7 个在本表查不到码，
  //    导致「国别页按码收敛」「sitemap 只收能归一的国家」会把它们漏掉。
  //    键取 country_aliases 的 canonical 原文（大小写不敏感、保留重音）；
  //    其中 PS / CD 的检索侧别名仍未登记，见 seo/country-slug.ts 的例外表。
  "bosnia and herzegovina": "BA",
  "congo, democratic republic of the": "CD",
  "côte d'ivoire": "CI",
  "cote d'ivoire": "CI",
  palestine: "PS",
  "trinidad and tobago": "TT",
  congo: "CG",
  "saint lucia": "LC",
};

const formatterCache = new Map<string, Intl.DisplayNames | null>();

function displayNames(locale: string): Intl.DisplayNames | null {
  const key = locale || "en";
  if (formatterCache.has(key)) return formatterCache.get(key) ?? null;
  try {
    const dn = new Intl.DisplayNames([key], { type: "region" });
    formatterCache.set(key, dn);
    return dn;
  } catch {
    formatterCache.set(key, null);
    return null;
  }
}

export function isCountryCode(value: string): value is CountryCode {
  return COUNTRY_SET.has(value);
}

/** 代码 → 当前语言的名称；未知代码原样返回 */
export function countryName(code: string | null | undefined, locale = "en"): string {
  const raw = String(code ?? "").trim().toUpperCase();
  if (!raw) return "";
  const dn = displayNames(locale);
  const name = dn?.of(raw);
  if (name && name !== raw && !/^[A-Z]{2}$/.test(name)) return name;
  const fallback = displayNames("en")?.of(raw);
  return fallback && fallback !== raw ? fallback : raw;
}

/** 名称/代码 → 代码；无法识别返回 null */
export function guessCountryCode(input: string | null | undefined): CountryCode | null {
  const text = String(input ?? "").trim();
  if (!text) return null;
  const upper = text.toUpperCase();
  if (isCountryCode(upper)) return upper;
  const alias = ALIASES[text.toLowerCase()];
  if (alias && isCountryCode(alias)) return alias;
  for (const code of COUNTRY_CODES) {
    if (countryName(code, "zh") === text || countryName(code, "en") === text) return code;
  }
  return null;
}

/** 排序后的下拉选项（按当前语言名称） */
export function countryOptions(locale = "en"): Array<{ code: CountryCode; name: string }> {
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code, locale) })).sort((a, b) =>
    a.name.localeCompare(b.name, locale),
  );
}
