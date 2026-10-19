/**
 * 门禁 PSOT：来源/采购平台归一「以表为准 + 单一入口」不变量（fail-closed）
 *
 * 断言：
 *   PS0 表就位：crm_platform_aliases 快照非空。
 *   PS1 零表缺口：opps/awards 的 source_platform、公告 url host、rfx platform_key
 *              每个观测写法都能被 resolvePlatform 解析（不产生 unresolved）⇒ 否则须补表。
 *   PS2 单一入口：src 内除 platform/alias-store.ts 外，任何文件不得再出现 "crm_platform_aliases"
 *              （禁旁路 SELECT，读表唯一入口）。
 *   PS3 退役不回潮：src 内不得再出现已退役的静态机制符号
 *              matchSourcePlatform / getSourcePlatformName / SOURCE_PLATFORMS / PLATFORMS[。
 *
 * 用法：npx tsx scripts/gates/check-platform-ssot.ts
 * @limits 只读。解析口径与 platform/resolve 完全一致（同 hostOf + resolvePlatform）。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import nodePath from "node:path";
import mysql from "mysql2/promise";
import { loadPlatformAliasSnapshot, hostOf } from "../../src/lib/services/platform/alias-store";
import { resolvePlatform } from "../../src/lib/services/platform/resolve";

const MAX_EXEC_MS = 120000;
const fails: string[] = [];

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

// ── PS2/PS3：源码静态扫描（读表入口唯一 + 退役符号不回潮）──
const SRC = nodePath.join(process.cwd(), "src");
const ALLOW_READER = "src/lib/services/platform/alias-store.ts";
// 只拦截“旁路 SQL”（真去 SELECT 本表）；注释里提到表名不算。
const readerRe = /\bFROM\s+`?crm_platform_aliases`?/i;
const retiredSym = /matchSourcePlatform|getSourcePlatformName|SOURCE_PLATFORMS|\bPLATFORMS\s*\[/;
function walk(dir: string, cb: (file: string) => void): void {
  for (const name of readdirSync(dir)) {
    const p = nodePath.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, cb);
    else if (/\.(ts|tsx)$/.test(name)) cb(p);
  }
}
const rel = (p: string) => p.slice(process.cwd().length + 1).split(nodePath.sep).join("/");
let bypassReaders: string[] = [];
let retiredRefs: string[] = [];
walk(SRC, (file) => {
  const text = readFileSync(file, "utf8");
  if (readerRe.test(text) && rel(file) !== ALLOW_READER) bypassReaders.push(rel(file));
  if (retiredSym.test(text)) retiredRefs.push(rel(file));
});
if (bypassReaders.length) fails.push(`PS2 旁路读表（只允许 platform/alias-store）：${bypassReaders.join(", ")}`);
if (retiredRefs.length) fails.push(`PS3 退役静态机制回潮（sourcePlatforms/PLATFORMS）：${retiredRefs.join(", ")}`);

// ── PS0/PS1：连库校验 ──
const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME ?? "crm", charset: "utf8mb4",
});
const q = async <T>(sql: string): Promise<T[]> => ((await conn.query(sql)) as unknown as [T[]])[0];

try {
  await conn.query(`SET SESSION MAX_EXECUTION_TIME = ${MAX_EXEC_MS}`);
  const snap = await loadPlatformAliasSnapshot(conn as never);
  if (snap.byKey.size === 0) fails.push("PS0 crm_platform_aliases 快照为空（表不存在或未灌数）");

  // PS1 观测写法全解析：opp/award 码、公告 host、rfx key
  const forms = new Set<string>();
  for (const r of await q<{ v: string }>("SELECT DISTINCT source_platform v FROM crm_bid_opportunities WHERE source_platform IS NOT NULL AND source_platform<>''")) if (r.v) forms.add(r.v);
  for (const r of await q<{ v: string }>("SELECT DISTINCT source_platform v FROM crm_bid_awards WHERE source_platform IS NOT NULL AND source_platform<>''")) if (r.v) forms.add(r.v);
  for (const r of await q<{ v: string }>("SELECT DISTINCT source_platform v FROM crm_bid_opportunities WHERE source_platform IS NOT NULL AND source_platform<>''")) if (r.v) forms.add(r.v);
  for (const r of await q<{ v: string }>(
    `SELECT DISTINCT SUBSTRING_INDEX(SUBSTRING_INDEX(SUBSTRING_INDEX(url,'://',-1),'/',1),':',1) v
     FROM crm_bid_notices WHERE url IS NOT NULL AND url<>''`,
  )) if (r.v) forms.add(r.v);
  for (const r of await q<{ v: string }>("SELECT DISTINCT platform_key v FROM crm_rfx_platform_map WHERE platform_key IS NOT NULL AND platform_key<>''")) if (r.v) forms.add(r.v);

  const unresolved: string[] = [];
  for (const form of forms) {
    const host = hostOf(form);
    if (!resolvePlatform(host || form, snap).ref) unresolved.push(host || form);
  }
  if (unresolved.length) fails.push(`PS1 表缺口 ${unresolved.length} 种写法（样例：${unresolved.slice(0, 20).map((s) => JSON.stringify(s)).join(" ; ")}）⇒ 需补 crm_platform_aliases`);

  console.log(`别名表快照：${snap.byKey.size} 键 / ${snap.byHost.size} host · 观测 distinct 写法 ${forms.size} 种 · 未解析 ${unresolved.length} 种`);
  if (fails.length) {
    for (const f of fails) console.error("  ✗ " + f);
    console.error("✗ 平台 SSOT 门禁未通过");
    process.exit(1);
  }
  console.log("✓ 平台 SSOT 门禁通过（PS0 表就位 / PS1 零缺口 / PS2 单一入口 / PS3 退役不回潮）");
} finally {
  await conn.end();
}
