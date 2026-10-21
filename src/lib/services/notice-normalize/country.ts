/**
 * 国家/地区归一化：源站国家名 → ISO 3166-1 alpha-2。
 *
 * 只做“名称→代码”，不做政治判断；未知时保留原名并返回 code=null，调用方打质量标记。
 */
export interface NormalizedCountry {
  code: string | null;
  name: string | null;
  source: "raw" | "alias" | "url" | "unknown";
  confidence: number;
}

const ISO_CODES = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(" ");
const display = new Intl.DisplayNames(["en"], { type: "region" });
const byName = new Map<string, string>();
for (const code of ISO_CODES) {
  const name = display.of(code);
  if (name && name !== code) byName.set(normalizeKey(name), code);
}
const ALIASES: Record<string, string> = {
  usa: "US", us: "US", "united states of america": "US", "u s a": "US", america: "US",
  uk: "GB", "u k": "GB", "great britain": "GB", britain: "GB", england: "GB", scotland: "GB", wales: "GB", "northern ireland": "GB",
  "south korea": "KR", "korea republic of": "KR", "republic of korea": "KR", korea: "KR",
  "north korea": "KP", "korea democratic peoples republic of": "KP",
  russia: "RU", "russian federation": "RU",
  vietnam: "VN", "viet nam": "VN",
  "czech republic": "CZ", czechia: "CZ",
  "ivory coast": "CI", "cote d ivoire": "CI", "côte d ivoire": "CI",
  "democratic republic of the congo": "CD", "congo dem rep": "CD", "congo democratic republic": "CD", "dr congo": "CD",
  "republic of the congo": "CG", congo: "CG",
  tanzania: "TZ", "united republic of tanzania": "TZ",
  bolivia: "BO", "plurinational state of bolivia": "BO",
  venezuela: "VE", "bolivarian republic of venezuela": "VE",
  iran: "IR", "islamic republic of iran": "IR",
  syria: "SY", "syrian arab republic": "SY",
  laos: "LA", "lao peoples democratic republic": "LA",
  moldova: "MD", "republic of moldova": "MD",
  macedonia: "MK", "north macedonia": "MK",
  turkey: "TR", turkiye: "TR", "türkiye": "TR",
  uae: "AE", "united arab emirates": "AE",
  "hong kong": "HK", "hong kong sar": "HK", macau: "MO", macao: "MO",
  taiwan: "TW", "chinese taipei": "TW",
  palestine: "PS", "state of palestine": "PS",
  kosovo: "XK",
  "cape verde": "CV", "cabo verde": "CV",
  swaziland: "SZ", eswatini: "SZ",
  burma: "MM", myanmar: "MM",
  "east timor": "TL", "timor leste": "TL",
  holland: "NL", netherlands: "NL", "the netherlands": "NL",
  "slovak republic": "SK", slovakia: "SK",
  bosnia: "BA", "bosnia and herzegovina": "BA",
  "central african republic": "CF",
  "dominican republic": "DO",
  "papua new guinea": "PG",
  "trinidad and tobago": "TT",
  "saint kitts and nevis": "KN", "st kitts and nevis": "KN",
  "saint lucia": "LC", "st lucia": "LC",
  "saint vincent and the grenadines": "VC", "st vincent and the grenadines": "VC",
  "antigua and barbuda": "AG", "sao tome and principe": "ST", "são tomé and príncipe": "ST",
  "equatorial guinea": "GQ", "guinea bissau": "GW", "guinea-bissau": "GW",
  "burkina faso": "BF", "sierra leone": "SL", "south sudan": "SS",
  "solomon islands": "SB", "marshall islands": "MH", "micronesia": "FM",
  "brunei darussalam": "BN", brunei: "BN",
};
function normalizeKey(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
const URL_TLD: Record<string, string> = {
  br: "BR", za: "ZA", ua: "UA", in: "IN", pl: "PL", us: "US", fr: "FR", es: "ES",
  pt: "PT", de: "DE", it: "IT", nl: "NL", be: "BE", ch: "CH", at: "AT", se: "SE",
  no: "NO", dk: "DK", fi: "FI", ie: "IE", gb: "GB", uk: "GB", ca: "CA", au: "AU",
  nz: "NZ", sg: "SG", my: "MY", id: "ID", th: "TH", vn: "VN", ph: "PH", jp: "JP",
  kr: "KR", cn: "CN", hk: "HK", tw: "TW", mx: "MX", ar: "AR", cl: "CL", co: "CO",
  pe: "PE", ec: "EC", py: "PY", uy: "UY", bo: "BO", ve: "VE", cr: "CR", pa: "PA",
  do: "DO", gt: "GT", hn: "HN", sv: "SV", ni: "NI", tr: "TR", il: "IL", ae: "AE",
  sa: "SA", qa: "QA", kw: "KW", bh: "BH", om: "OM", jo: "JO", eg: "EG", ma: "MA",
  ng: "NG", ke: "KE", gh: "GH", tz: "TZ", ug: "UG", zw: "ZW", zm: "ZM", bw: "BW",
  na: "NA", mz: "MZ", ao: "AO", sn: "SN", ci: "CI", cm: "CM", cd: "CD", cg: "CG",
  ru: "RU", kz: "KZ", uz: "UZ", pk: "PK", bd: "BD", lk: "LK", np: "NP", mm: "MM",
};

export function normalizeCountry(raw: unknown, url?: unknown): NormalizedCountry {
  const original = String(raw ?? "").trim();
  const key = normalizeKey(original);
  if (key) {
    if (/^[a-z]{2}$/i.test(original) && ISO_CODES.includes(original.toUpperCase())) {
      return { code: original.toUpperCase(), name: display.of(original.toUpperCase()) ?? original, source: "raw", confidence: 95 };
    }
    if (ALIASES[key]) {
      const code = ALIASES[key];
      return { code, name: display.of(code) ?? original, source: "alias", confidence: 90 };
    }
    const code = byName.get(key);
    if (code) return { code, name: display.of(code) ?? original, source: "raw", confidence: 95 };
  }
  const host = /^https?:\/\/([^/]+)/i.exec(String(url ?? ""))?.[1]?.toLowerCase();
  const tld = host?.split(".").pop();
  if (tld && URL_TLD[tld]) {
    const code = URL_TLD[tld];
    return { code, name: display.of(code) ?? original, source: "url", confidence: 60 };
  }
  return { code: null, name: original || null, source: "unknown", confidence: 0 };
}
