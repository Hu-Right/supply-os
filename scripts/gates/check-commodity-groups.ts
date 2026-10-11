/**
 * 品目大类门禁 CG1~CG5
 *
 * @script scripts/gates/check-commodity-groups.ts
 * @assertions
 *   CG1 大类恰为 15 个，且码形制为 UGT-G-NN
 *   CG2 段前缀形制合法（2 位数字）
 *   CG3 一段只属一类（与库内 uk_segment/uk_prefix 双保险）
 *   CG4 每类 name_zh 非空
 *   CG5（仅 --db）库内归属与常量逐项一致，且覆盖品目面全部 58 段
 * @limits 静态部分必须能在无 MySQL 的 CI（quality-gate job 没有库）里跑；CG5 是本地/发布前闸口。
 * @usage  npx tsx scripts/gates/check-commodity-groups.ts [--db]
 * @see    docs/superpowers/specs/2026-10-10-commodity-facet-15-groups-design.md §10.1
 */
import { readFileSync } from "node:fs";
import { COMMODITY_GROUPS, validateCommodityGroups } from "../../src/lib/services/commodity/groups";

type Def = { code: string; nameZh: string; prefixes: readonly string[] };

const DB = process.argv.includes("--db");
const FIXTURE = process.env.COMMODITY_GROUPS_FIXTURE;

/** fixture 模式：让本门禁的正反例可在无库环境被测（口径同 SSOT_SCAN_ROOT / SEED_SCHEMA_DIR） */
const groups: readonly Def[] = FIXTURE
  ? (JSON.parse(readFileSync(FIXTURE, "utf8")) as Def[])
  : COMMODITY_GROUPS;

/**
 * 校验口径只有一份：常量模块的 validateCommodityGroups()。
 * fixture 模式下破坏样本本来就少于全量类数，CG1 的类数断言按 fixture 语义重算。
 */
const problems: string[] = [...validateCommodityGroups(groups)];
if (FIXTURE) {
  // fixture 是刻意构造的破坏样本，「展开段数与去重段数自洽」这条只对真实常量有意义
  for (let i = problems.length - 1; i >= 0; i -= 1) {
    if (problems[i].startsWith("CG3 去重段数")) problems.splice(i, 1);
  }
}

const totalPrefixes = groups.reduce((s, g) => s + (g.prefixes?.length ?? 0), 0);
console.log(`静态：${groups.length} 类 / ${totalPrefixes} 段前缀${FIXTURE ? "（fixture 模式）" : ""}`);

if (DB && !FIXTURE) {
  const mysql = (await import("mysql2/promise")).default;
  for (const line of readFileSync(new URL("../../.env", import.meta.url), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
  const pool = await mysql.createPool({
    host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME ?? "crm", charset: "utf8mb4", dateStrings: true,
  });

  const [rows] = (await pool.query(
    `SELECT group_code, unspsc_prefix FROM crm_commodity_group_segments ORDER BY unspsc_prefix`,
  )) as [Array<{ group_code: string; unspsc_prefix: string }>, unknown];
  const dbMap = new Map(rows.map((r) => [r.unspsc_prefix, r.group_code]));

  for (const g of groups) {
    for (const p of g.prefixes) {
      const got = dbMap.get(p);
      if (!got) problems.push(`CG5 段 ${p} 在库内没有归属行`);
      else if (got !== g.code) problems.push(`CG5 段 ${p} 库内=${got}，常量=${g.code}`);
    }
  }
  for (const [p, g] of dbMap) {
    if (!groups.some((x) => x.prefixes.includes(p))) problems.push(`CG5 库内多出段 ${p}→${g}，常量里没有`);
  }

  // 品目面 58 段必须一个不漏地被认领（漏一段=那一段的公告永远筛不到）
  const [segs] = (await pool.query(
    `SELECT LEFT(unspsc_code, 2) p FROM crm_commodity_nodes WHERE level='segment'`,
  )) as [Array<{ p: string }>, unknown];
  for (const s of segs) if (!dbMap.has(s.p)) problems.push(`CG5 品目面段 ${s.p} 未分配到任何大类`);

  const names = (await pool.query(
    `SELECT code, name_zh FROM crm_commodity_groups ORDER BY code`,
  )) as [Array<{ code: string; name_zh: string }>, unknown];
  for (const n of names[0]) {
    const g = groups.find((x) => x.code === n.code);
    if (!g) problems.push(`CG5 库内大类 ${n.code} 在常量里没有`);
    else if (g.nameZh !== n.name_zh) problems.push(`CG5 ${n.code} 名称不一致：库内=${n.name_zh} 常量=${g.nameZh}`);
  }

  console.log(`DB：库内归属 ${dbMap.size} 段 / 品目面段 ${segs.length} 段 / 库内大类 ${names[0].length} 个`);
  await pool.end();
}

if (problems.length) {
  console.error("❌ 品目大类门禁未通过：");
  for (const p of [...new Set(problems)]) console.error("  - " + p);
  process.exit(1);
}
console.log(`✅ CG1~CG4 通过（${groups.length} 类；DB 侧 ${DB && !FIXTURE ? "已比对" : "未比对，本地加 --db 执行"}）`);
