// T-B3 金额解析缓存验证脚本（本地差异 #10）
// 用法：node scripts/verify-amount-cache.mjs [user_key]
// 动作：①建自有缓存表（IF NOT EXISTS）②分批回填（≤2000 行/批，可中断续跑）
//      ③解析质量统计 + 抽样眼检 ④s_amount 评分 SQL 实测
// 解析逻辑与 server.ts parseEstimatedValue（#10）同构，规则变更需同步两处并递增版本号
import mysql from "mysql2/promise";

const AMOUNT_PARSE_VERSION = 1;
const USD_RATE = {
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
const CURRENCY_NAME_MAP = {
  "美元": "USD", "欧元": "EUR", "英镑": "GBP", "人民币": "CNY", "日元": "JPY",
  "巴西雷亚尔": "BRL", "雷亚尔": "BRL", "菲律宾比索": "PHP", "印度卢比": "INR", "印尼盾": "IDR",
  "越南盾": "VND", "泰铢": "THB", "韩元": "KRW", "卢布": "RUB", "墨西哥比索": "MXN",
  "智利比索": "CLP", "哥伦比亚比索": "COP", "阿根廷比索": "ARS", "南非兰特": "ZAR",
  "埃及镑": "EGP", "土耳其里拉": "TRY", "沙特里亚尔": "SAR", "迪拉姆": "AED", "港元": "HKD",
  "新台币": "TWD", "新加坡元": "SGD", "瑞士法郎": "CHF", "加元": "CAD", "澳元": "AUD",
};
const COUNTRY_CURRENCY_MAP = {
  brazil: "BRL", philippines: "PHP", india: "INR", indonesia: "IDR", "viet nam": "VND", vietnam: "VND",
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

function parseEstimatedValue(raw, country) {
  const text = String(raw || "").trim();
  if (!text) return null;
  if (!/[0-9]/.test(text)) return null;
  const cleaned = text.replace(/(\d),(?=\d{3}(\D|$))/g, "$1");
  const nums = (cleaned.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((v) => Number.isFinite(v) && v > 0);
  if (nums.length === 0) return null;
  const isRange = nums.length >= 2 && /\d[\s,.]*(?:-|~|—|～|至|to)\s*[\d]/i.test(cleaned);
  let amount = isRange ? (nums[0] + nums[1]) / 2 : nums[0];
  if (amount >= 1e15) return null;
  amount = Math.round(amount * 100) / 100;
  let currency = null;
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

const userKey = (process.argv[2] || "1403618157@qq.com").trim().toLowerCase();
const pool = await mysql.createPool({
  host: "192.168.1.2", user: "root", password: "123456", database: "crm",
  waitForConnections: true, connectionLimit: 3,
});

console.log("== ① 建表（IF NOT EXISTS，自有表）==");
await pool.query(`
  CREATE TABLE IF NOT EXISTS crm_notice_amount_cache (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    notice_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(20,2) NULL,
    currency VARCHAR(10) NULL,
    amount_usd DECIMAL(20,2) NULL,
    inferred TINYINT(1) NOT NULL DEFAULT 0,
    parse_version SMALLINT NOT NULL DEFAULT 1,
    parsed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_notice (notice_id),
    KEY idx_version (parse_version)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`);
console.log("表就绪");

console.log("\n== ② 分批回填（≤2000 行/批）==");
const t0 = Date.now();
let totalProcessed = 0;
for (let i = 0; i < 80; i++) {
  const [rows] = await pool.query(
    `SELECT n.id, n.estimated_value, n.country
     FROM crm_bid_notices n
     LEFT JOIN crm_notice_amount_cache c ON c.notice_id = n.id AND c.parse_version = ?
     WHERE c.notice_id IS NULL
     LIMIT 2000`,
    [AMOUNT_PARSE_VERSION]
  );
  if (rows.length === 0) break;
  const values = [];
  for (const row of rows) {
    const parsed = parseEstimatedValue(row.estimated_value, row.country);
    values.push(Number(row.id), parsed?.amount ?? null, parsed?.currency ?? null,
      parsed?.amountUsd ?? null, parsed?.inferred ? 1 : 0, AMOUNT_PARSE_VERSION);
  }
  await pool.query(
    `INSERT INTO crm_notice_amount_cache (notice_id, amount, currency, amount_usd, inferred, parse_version)
     VALUES ${rows.map(() => "(?,?,?,?,?,?)").join(",")}
     ON DUPLICATE KEY UPDATE amount=VALUES(amount), currency=VALUES(currency), amount_usd=VALUES(amount_usd),
       inferred=VALUES(inferred), parse_version=VALUES(parse_version), parsed_at=CURRENT_TIMESTAMP`,
    values
  );
  totalProcessed += rows.length;
  if (i % 10 === 0) console.log(`  批 ${i + 1}：累计 ${totalProcessed} 行，${Date.now() - t0}ms`);
}
console.log(`回填完成：${totalProcessed} 行，耗时 ${Date.now() - t0}ms`);

console.log("\n== ③ 解析质量统计 ==");
const [[stat]] = await pool.query(`
  SELECT COUNT(*) AS total,
         SUM(amount IS NOT NULL) AS parsed_cnt,
         SUM(amount_usd IS NOT NULL) AS usd_cnt,
         SUM(inferred = 1) AS inferred_cnt
  FROM crm_notice_amount_cache`);
console.log(`缓存行数=${stat.total} 解析出金额=${stat.parsed_cnt} 可折USD=${stat.usd_cnt} inferred=${stat.inferred_cnt}`);
const [currDist] = await pool.query(`
  SELECT currency, COUNT(*) AS cnt FROM crm_notice_amount_cache
  WHERE currency IS NOT NULL GROUP BY currency ORDER BY cnt DESC LIMIT 10`);
console.log("币种分布 TOP10:", currDist.map((r) => `${r.currency}=${r.cnt}`).join(" "));

// 抽样眼检：源值有数字的行，解析是否合理
const [samples] = await pool.query(`
  SELECT n.estimated_value, n.country, c.amount, c.currency, c.amount_usd, c.inferred
  FROM crm_notice_amount_cache c
  INNER JOIN crm_bid_notices n ON n.id = c.notice_id
  WHERE n.estimated_value IS NOT NULL AND n.estimated_value REGEXP '[0-9]'
  ORDER BY RAND() LIMIT 20`);
console.log("\n抽样 20 条（源值 → 解析结果）：");
for (const s of samples) {
  console.log(`  "${String(s.estimated_value).slice(0, 45)}" [${String(s.country || "").slice(0, 20)}]`
    + ` → amount=${s.amount} ${s.currency || "?"} usd=${s.amount_usd} inferred=${s.inferred}`);
}
// 正确率抽检：200 条有数字源值中解析非空占比（数字提取失败即为漏解析）
const [[acc]] = await pool.query(`
  SELECT COUNT(*) AS with_digit, SUM(c.amount IS NOT NULL) AS parsed_ok
  FROM (SELECT id, estimated_value FROM crm_bid_notices
        WHERE estimated_value REGEXP '[1-9]' ORDER BY RAND() LIMIT 200) t
  INNER JOIN crm_notice_amount_cache c ON c.notice_id = t.id`);
console.log(`\n含有效数字样本 ${acc.with_digit} 条中解析出金额 ${acc.parsed_ok} 条（${(acc.parsed_ok / acc.with_digit * 100).toFixed(1)}%）`);

console.log("\n== ④ s_amount 评分 SQL 实测 ==");
const [[pref]] = await pool.query(`
  SELECT AVG(LOG10(c.amount_usd + 1)) AS center_log, COUNT(*) AS cnt
  FROM crm_opportunity_unlocks u
  INNER JOIN crm_notice_amount_cache c ON c.notice_id = u.notice_id
  WHERE u.user_key = ? AND u.notice_id IS NOT NULL AND c.amount_usd IS NOT NULL AND c.amount_usd > 0`,
  [userKey]);
console.log(`用户 ${userKey}：解锁金额样本=${pref.cnt} center_log=${pref.center_log}`);
const centerLog = pref.cnt >= 2 ? Number(pref.center_log) : 4.0; // 样本不足时用 1 万 USD 档模拟验证 SQL
console.log(`（评分实测用 center_log=${centerLog.toFixed(3)}${pref.cnt >= 2 ? "" : "，模拟值仅验证 SQL 可执行性"}）`);
const t1 = Date.now();
const [scored] = await pool.query(`
  SELECT n.id, LEFT(n.title, 40) AS title, amc.amount_usd, amc.inferred,
    (CASE WHEN amc.amount_usd IS NULL OR amc.amount_usd <= 0 THEN 0.5
       ELSE 0.5 + (GREATEST(0, 1 - ABS(LOG10(amc.amount_usd + 1) - ?) / 3) - 0.5)
            * IF(amc.inferred = 1, 0.7, 1) END) AS s_amount
  FROM crm_bid_notices n
  LEFT JOIN crm_notice_amount_cache amc ON amc.notice_id = n.id
  WHERE (n.is_expired = 0 OR n.is_expired IS NULL)
  ORDER BY RAND() LIMIT 10`, [centerLog]);
console.log(`s_amount 表达式实测（${Date.now() - t1}ms）：`);
for (const r of scored) {
  console.log(`  #${r.id} usd=${r.amount_usd} inf=${r.inferred} s_amount=${Number(r.s_amount).toFixed(4)} | ${r.title}`);
}

await pool.end();
console.log("\n验证完成");
