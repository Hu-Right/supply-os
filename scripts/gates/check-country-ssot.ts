/**
 * 门禁 CSOT：国家归一「以表为准」不变量（fail-closed）
 *
 * 断言（对已入索引的活跃公告）：
 *   CS1 零表缺口：每个 country 写法都能被 crm_country_aliases 解析（resolveCountries 不产生 unresolved）；
 *   CS2 回填一致：country_codes 与「按表现算」逐写法相等（漂移即红，防止读切换后两套口径又分叉）。
 *
 * 用法：npx tsx scripts/gates/check-country-ssot.ts
 * @limits 只读。口径与 scripts/ops/country-codes-backfill.ts 完全一致（同一 resolveCountries + 同清洗键）。
 */
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { ACTIVE_NOTICE_WHERE } from "../../src/lib/utils/notice-expired";
import { loadCountryAliasSnapshot } from "../../src/lib/services/country/alias-store";
import { resolveCountries, countryCodesOf } from "../../src/lib/services/country/resolve";

const MAX_EXEC_MS = 120000;
const fails: string[] = [];

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm",
  charset: "utf8mb4",
});

const q = async <T>(sql: string): Promise<T[]> => ((await conn.query(sql)) as unknown as [T[]])[0];

try {
  await conn.query(`SET SESSION MAX_EXECUTION_TIME = ${MAX_EXEC_MS}`);
  const snap = await loadCountryAliasSnapshot(conn as never);
  if (snap.byKey.size === 0) fails.push("CS0 别名表快照为空（表不存在或未灌数）");

  const expectedOf = (raw: string) => [...new Set(countryCodesOf(resolveCountries(raw, snap)))].join(",");

  // CS1 零表缺口：按写法去重
  const writings = await q<{ raw: string; cnt: number }>(
    `SELECT n.country raw, COUNT(*) cnt FROM crm_bid_notices n
     JOIN crm_notice_search w ON w.id = n.id
     WHERE ${ACTIVE_NOTICE_WHERE} AND n.country IS NOT NULL AND n.country <> ''
     GROUP BY n.country`
  );
  let gaps = 0;
  const gapSample: string[] = [];
  for (const r of writings) {
    if (resolveCountries(String(r.raw), snap).unresolved) {
      gaps += Number(r.cnt);
      if (gapSample.length < 20) gapSample.push(JSON.stringify(r.raw));
    }
  }

  // CS2 回填一致：逐写法×存量值 与现算比对
  const dist = await q<{ raw: string; codes_stored: string; cnt: number }>(
    `SELECT n.country raw, w.country_codes codes_stored, COUNT(*) cnt FROM crm_bid_notices n
     JOIN crm_notice_search w ON w.id = n.id
     WHERE ${ACTIVE_NOTICE_WHERE} AND n.country IS NOT NULL AND n.country <> ''
     GROUP BY n.country, w.country_codes`
  );
  let drift = 0;
  const driftSample: string[] = [];
  for (const d of dist) {
    const exp = expectedOf(String(d.raw));
    if (String(d.codes_stored ?? "") !== exp) {
      drift += Number(d.cnt);
      if (driftSample.length < 20) driftSample.push(`${JSON.stringify(d.raw)}: stored=${JSON.stringify(d.codes_stored)} 期望=${JSON.stringify(exp)}`);
    }
  }

  if (gaps > 0) fails.push(`CS1 表缺口 ${gaps} 条（样例：${gapSample.join(" ; ")}）⇒ 需补 crm_country_aliases`);
  if (drift > 0) fails.push(`CS2 country_codes 与表现算不一致 ${drift} 行（样例：${driftSample.join(" ; ")}）⇒ 复跑 country-codes-backfill --apply`);

  console.log(`别名表快照：${snap.byKey.size} 键 · 写法 ${writings.length} 种 · 分布 ${dist.length} 组`);
  if (fails.length) {
    for (const f of fails) console.error("  ✗ " + f);
    console.error("✗ 国家 SSOT 门禁未通过");
    process.exit(1);
  }
  console.log("✓ 国家 SSOT 门禁通过（CS1 零表缺口 / CS2 country_codes 与表现算逐写法一致）");
} finally {
  await conn.end();
}
