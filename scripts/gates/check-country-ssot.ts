/**
 * 门禁 CSOT：国家归一「以表为准」不变量（fail-closed）
 *
 * 断言（对已入宽表/索引的活跃公告）：
 *   CS1 零表缺口：每个 country 写法都能被 country_aliases 解析（resolveCountries 不产生 unresolved）；
 *   CS2 回填一致：country_codes 与「按写法现算」逐组相等（漂移即红，防止读切换后两套口径又分叉）；
 *   CS3 展示旁路：src 不得从静态字典 lib/data/countryNames 引入展示函数；
 *   CS3b 静态国家名词表残留：src 不得再维护 COUNTRY_NAME_KW。
 *
 * 用法：npx tsx scripts/gates/check-country-ssot.ts                 # 本地/lint：无库则 SKIP
 *       npx tsx scripts/gates/check-country-ssot.ts --require-db    # CI/部署：无库即红
 *
 * @limits 只读。
 *
 * [2026-11-25] 取数改为只读宽表：
 *   旧 SQL 是「bid_notices JOIN notice_search + GROUP BY n.country」，63 万行上必然全表扫 +
 *   连接，120s 的 MAX_EXECUTION_TIME 被击穿（ER_QUERY_TIMEOUT）——门禁其实从未真正跑通过。
 *   宽表 country_name 就是主表 n.country 的构建期直拷，按 (country_name, country_codes) 分组
 *   与旧口径等价，实测秒级；活跃口径用宽表 deadline_sec（= 服务表 deadline_ts 的投影）。
 *   CI 的 quality-gate 没有数据库服务，故默认 SKIP；需要强制的环境用 --require-db。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import mysql from "mysql2/promise";
import { loadCountryAliasSnapshot } from "../../src/lib/services/country/alias-store";
import { resolveCountries, countryCodesOf } from "../../src/lib/services/country/resolve";

const MAX_EXEC_MS = 120000;
const REQUIRE_DB = process.argv.includes("--require-db");
const fails: string[] = [];

try {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
} catch {
  // 无 .env（CI）：直接用环境变量；连不上库时按 REQUIRE_DB 决定 SKIP/红
}

/** 递归收集 src 下 .ts/.tsx 源文件（正斜杠路径，跨平台一致）。 */
function walk(dir: string): string[] {
  const acc: string[] = [];
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) acc.push(...walk(p));
    else if (/\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

let conn: mysql.Connection;
try {
  conn = await mysql.createConnection({
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME ?? "crm",
    charset: "utf8mb4",
    connectTimeout: 5000,
  });
} catch (err) {
  const msg = `无可用数据库（${(err as Error).message}）`;
  if (REQUIRE_DB) {
    console.error("  ✗ " + msg + "（--require-db）");
    console.error("✗ 国家 SSOT 门禁未通过");
    process.exit(1);
  }
  console.log(`⚠ 国家 SSOT 门禁 SKIP：${msg}；库可用环境请加 --require-db 强制`);
  process.exit(0);
}

const q = async <T>(sql: string): Promise<T[]> => ((await conn.query(sql)) as unknown as [T[]])[0];

/** 活跃口径（宽表）：与 MEILI_ACTIVE_FILTER / ACTIVE_NOTICE_WHERE 同判据，仅字段名不同 */
const WIDE_ACTIVE = "(deadline_sec = 0 OR deadline_sec >= UNIX_TIMESTAMP(NOW()))";

try {
  await conn.query(`SET SESSION MAX_EXECUTION_TIME = ${MAX_EXEC_MS}`);
  const snap = await loadCountryAliasSnapshot(conn as never);
  if (snap.byKey.size === 0) fails.push("CS0 别名表快照为空（表不存在或未灌数）");

  // CS1 零表缺口：按写法去重
  const writings = await q<{ raw: string; cnt: number }>(
    `SELECT country_name AS raw, COUNT(*) cnt FROM notice_search
      WHERE ${WIDE_ACTIVE} AND country_name <> ''
      GROUP BY country_name`,
  );
  let gaps = 0;
  const gapSample: string[] = [];
  for (const r of writings) {
    if (resolveCountries(String(r.raw), snap).unresolved) {
      gaps += Number(r.cnt);
      if (gapSample.length < 20) gapSample.push(JSON.stringify(r.raw));
    }
  }

  // CS2 回填一致：逐写法×存量值 与现算比对。
  //   - 集合比较：country_codes 是码集，回填脚本按 GROUP_CONCAT(... ORDER BY code) 字母序，
  //     现算按别名解析序，两者顺序不同不算漂移（旧实现按字符串比，多国行会永久红）。
  //   - 截断容忍：宽表 country_name 构建期截断 100 字符，长多国串的「期望集」只能算到截断处，
  //     而存量是服务表按完整原文算出的全集 ⇒ 截断行的正确关系是「期望 ⊆ 存量」，不是相等。
  const splitCodes = (s: unknown) => new Set(String(s ?? "").split(",").map((x) => x.trim()).filter(Boolean));
  const isSubset = (sub: Set<string>, sup: Set<string>) => [...sub].every((c) => sup.has(c));
  const dist = await q<{ raw: string; codes_stored: string; cnt: number }>(
    `SELECT country_name AS raw, country_codes AS codes_stored, COUNT(*) cnt FROM notice_search
      WHERE ${WIDE_ACTIVE} AND country_name <> ''
      GROUP BY country_name, country_codes`,
  );
  let drift = 0;
  const driftSample: string[] = [];
  for (const d of dist) {
    const raw = String(d.raw);
    const stored = splitCodes(d.codes_stored);
    const expected = new Set(countryCodesOf(resolveCountries(raw, snap)));
    const truncated = raw.length >= 100; // 与 buildWideRow 的 .slice(0, 100) 对齐
    const ok = truncated
      ? isSubset(expected, stored)
      : expected.size === stored.size && isSubset(expected, stored);
    if (!ok) {
      drift += Number(d.cnt);
      if (driftSample.length < 20) {
        driftSample.push(`${JSON.stringify(raw)}: stored=${JSON.stringify(d.codes_stored)} 期望=${JSON.stringify([...expected].join(","))}`);
      }
    }
  }

  // CS3 展示旁路锁定：src 不得从静态字典 lib/data/countryNames 引入展示函数
  //   （客户端 @/shared/data/countryNames 是表驱动运行时入口，放行；agency-i18n 引数据 map 非展示函数，放行）
  const displayFnRe = /\b(getCountryDisplayName|getCountryEnglishName)\b/;
  const staticImportRe = /from\s+["'][^"']*data\/countryNames["']/;
  const bypass: string[] = [];
  for (const f of walk("src")) {
    if (f.endsWith("lib/data/countryNames.ts")) continue; // 定义处
    const text = readFileSync(f, "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!staticImportRe.test(line) || !displayFnRe.test(line)) continue;
      if (line.includes("shared/data/countryNames")) continue; // 客户端表驱动入口
      bypass.push(`${f}: ${line.trim()}`);
    }
  }

  if (gaps > 0) fails.push(`CS1 表缺口 ${gaps} 条（样例：${gapSample.join(" ; ")}）⇒ 需补 country_aliases`);
  if (drift > 0) fails.push(`CS2 country_codes 与表现算不一致 ${drift} 行（样例：${driftSample.join(" ; ")}）⇒ 复跑 scripts/tools/wide-country-update.ts`);

  if (bypass.length) fails.push(`CS3 展示旁路：src 从静态字典 lib/data 引入展示函数\n    ${bypass.join("\n    ")}\n    ⇒ 展示须走 /api/catalog/country-name-map（表）或 country/resolve`);

  // CS3b 静态国家名词表残留锁定：src 任何模块不得再维护 COUNTRY_NAME_KW（国家名一律走 country_aliases）
  const staticCountryKw = walk("src").filter((f) => /\bCOUNTRY_NAME_KW\b/.test(readFileSync(f, "utf8")));
  if (staticCountryKw.length) fails.push(`CS3b 静态国家名词表残留：\n    ${staticCountryKw.join("\n    ")}\n    ⇒ 国家名一律走 country_aliases（country/display matchCountryZhInText）`);

  console.log(`别名表快照：${snap.byKey.size} 键 · 写法 ${writings.length} 种 · 分布 ${dist.length} 组`);
  if (fails.length) {
    for (const f of fails) console.error("  ✗ " + f);
    console.error("✗ 国家 SSOT 门禁未通过");
    process.exit(1);
  }
  console.log("✓ 国家 SSOT 门禁通过（CS1 零表缺口 / CS2 country_codes 与表现算逐组一致 / CS3 展示无静态旁路）");
} finally {
  await conn.end();
}
