/**
 * 品目大类门禁 CG1~CG7
 *
 * @script scripts/gates/check-commodity-groups.ts
 * @assertions
 *   CG1 大类恰为 32 个（口径源 EXPECTED_COMMODITY_GROUP_COUNT），且码形制为 UGT-G-NN
 *   CG2 段前缀形制合法（2 位数字）
 *   CG3 一段只属一类（与库内 uk_segment/uk_prefix 双保险）
 *   CG4 每类 name_zh 非空
 *   CG5（仅 --db）库内段归属与常量逐项一致（两个方向），且库内大类码域恰为 32 个
 *      （旧树 crm_commodity_nodes 下线后，品目面 58 段对账改由 backbone 门禁 BB4/BB7 守，本项打印跳过）
 *   CG6（静态）src/** 与 scripts/tools/** 不得用 SQL 读已退役的 crm_commodity_groups（含改名后的退役名）——
 *      「大类表可以删」的机器证明，写法同 BB8 对旧树的扫描
 *   CG7（仅 --db）大类表已退役：crm_commodity_groups 及其 retired 变体都不许在场
 * @limits 静态部分必须能在无 MySQL 的 CI（quality-gate job 没有库）里跑；CG5/CG7 是本地/发布前闸口。
 * @usage  npx tsx scripts/gates/check-commodity-groups.ts [--db]
 * @see    docs/adr/0008-commodity-groups-table-retirement.md（CG6/CG7 的由来）
 * @see    docs/superpowers/specs/2026-10-10-commodity-facet-15-groups-design.md §10.1
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMMODITY_GROUPS,
  EXPECTED_COMMODITY_GROUP_COUNT,
  validateCommodityGroups,
} from "../../src/lib/services/commodity/groups";

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

// ── CG6 大类表零引用（静态，无库也能跑；CI 与本地同一道闸）──
// crm_commodity_groups 已于 ADR-0008 退役：32 类身份的唯一事实源是常量 + crm_commodity_group_segments。
// 只抓 SQL 语境（FROM / JOIN + 表名），不把注释里的历史提及算违规；后缀 \w* 让「改名成 retired_* 再读」
// 也算违规——`_` 在正则里是单词字符，拿 \b 收尾会让改名等于豁免（同 BB8 写法）。
// 扫描根：src/**（随包运行）+ scripts/tools/**（长期在用的工具）。不含 scripts/gates 自身（本文件用字符串
// 字面量做自检，扫自己必误伤），也不含 scripts/ops（一次性连库脚本，已由 check-gitignore-consistency 强制不入库）。
const RETIRED_RE = /\b(?:FROM|JOIN)\s+`?(?:\w+`?\.)?`?crm_commodity_groups\w*\b/i;
// 断言自身不许哑火：三条自检分别钉住「改名不豁免」「库名限定不豁免」「不误伤兄弟表/新树」
if (!RETIRED_RE.test("SELECT 1 FROM crm_commodity_groups_retired_20261012")) {
  problems.push("CG6 自检失败：正则匹配不到改名后的退役表，这条断言已哑火");
}
if (!RETIRED_RE.test("SELECT 1 FROM crm.crm_commodity_groups")) {
  problems.push("CG6 自检失败：带库名限定的退役表名没被抓到");
}
if (RETIRED_RE.test("SELECT 1 FROM crm_commodity_group_segments") || RETIRED_RE.test("SELECT 1 FROM crm_commodity_backbone")) {
  problems.push("CG6 自检失败：正则把段归属表/新树误判成退役表");
}
const scanned: string[] = [];
for (const rel of ["../../src", "../../scripts/tools"]) {
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|mjs|cjs|js)$/.test(name)) scanned.push(p);
    }
  };
  try {
    walk(fileURLToPath(new URL(rel, import.meta.url)));
  } catch {
    // 目录读不到（奇异检出环境）：不阻断，但必须叫出来，不能让断言静默失效
    problems.push(`CG6 未能扫描 ${rel}（目录不可读）：退役表零引用断言本次未执行`);
  }
}
const hits = scanned.filter((f) => RETIRED_RE.test(readFileSync(f, "utf8")));
if (hits.length) {
  problems.push(
    `CG6 有 ${hits.length} 个文件仍用 SQL 读已退役的 crm_commodity_groups：` +
      `${hits.map((h) => h.split(/[\\/]/).slice(-2).join("/")).join("、")}` +
      ` ⇒ 32 类口径改从常量 + crm_commodity_group_segments 取（见 ADR-0008）`,
  );
}

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

  // 大类码域：段归属是大类码在库里唯一还存身的地方，去重后必须恰好是常量那 32 个。
  // 退役前这条由「读 crm_commodity_groups 逐行比 name_zh」承担（ADR-0008）；表退役后 name_zh 只存在于
  // 常量，库侧能验的只剩「码域 + 段归属」——两者合起来已足以证明「库里没有常量之外的类」：
  // 任何多出来的码都得挂在某个段前缀上，而段前缀已被上面两个方向逐一钉死。
  const [dom] = (await pool.query(
    `SELECT COUNT(DISTINCT group_code) c FROM crm_commodity_group_segments`,
  )) as [Array<{ c: number }>, unknown];
  const domCount = Number(dom[0]!.c);
  if (domCount !== EXPECTED_COMMODITY_GROUP_COUNT) {
    problems.push(
      `CG5 库内段归属用到的大类码 ${domCount} 个，应为 ${EXPECTED_COMMODITY_GROUP_COUNT}（码域缺项或串位）`,
    );
  }

  // 品目面 58 段必须一个不漏地被认领（漏一段=那一段的公告永远筛不到）。
  // 段的清单仍从旧树取（它是唯一同时带齐 58 个段行的历史事实）；旧树一下线就没得比了：
  // 「每段都有归属」的保证改由 backbone 门禁接手（BB4 逐段定大类、BB7 逐码对树），这里明确打印跳过。
  const [legacyTab] = (await pool.query(
    `SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'crm_commodity_nodes'`,
  )) as [Array<{ n: number }>, unknown];
  let segCount: number | null = null;
  if (Number(legacyTab[0]!.n) > 0) {
    const [segs] = (await pool.query(
      `SELECT LEFT(unspsc_code, 2) p FROM crm_commodity_nodes WHERE level='segment'`,
    )) as [Array<{ p: string }>, unknown];
    segCount = segs.length;
    for (const s of segs) if (!dbMap.has(s.p)) problems.push(`CG5 品目面段 ${s.p} 未分配到任何大类`);
  } else {
    console.log("  – CG5 段全覆盖跳过：旧树 crm_commodity_nodes 已不在库里（该不变量已改由 BB4/BB7 守）");
  }

  // ── CG7 大类表退役不变量（ADR-0008）──
  // 两个名字都不许在场：正名在场 = 退役没做完；retired_* 在场 = 改名改一半（ADR-0006 对旧树的同款理由：
  // 「退役」不允许停留在口头，也不允许停在中间态）。报错里直接给出收尾与回滚两条命令，不留给下一个人猜。
  const [stillThere] = (await pool.query(
    `SELECT TABLE_NAME t FROM information_schema.TABLES
      WHERE table_schema = DATABASE() AND TABLE_NAME REGEXP '^crm_commodity_groups(_|$)'`,
  )) as [Array<{ t: string }>, unknown];
  if (stillThere.length) {
    problems.push(
      `CG7 大类表仍在库里：${stillThere.map((r) => r.t).join("、")}` +
        ` ⇒ 该表已按 ADR-0008 退役（32 类身份改由常量 + crm_commodity_group_segments 承载）。` +
        `收尾：npx tsx scripts/ops/commodity-groups-retire.ts --apply --yes（先导出副本再改名→落刀）；` +
        `回滚：把 runtime/commodity-groups-dump-*.sql 回灌`,
    );
  }

  console.log(
    `DB：库内归属 ${dbMap.size} 段 / 库内大类码 ${domCount} 个 / ` +
      `品目面段 ${segCount === null ? "—（旧树已下线，无对照物）" : `${segCount} 段`} / ` +
      `大类表 ${stillThere.length ? "⚠ 仍在场" : "已退役"}`,
  );
  await pool.end();
}

if (problems.length) {
  console.error("❌ 品目大类门禁未通过：");
  for (const p of [...new Set(problems)]) console.error("  - " + p);
  process.exit(1);
}
console.log(`✅ CG1~CG4 通过（${groups.length} 类；DB 侧 ${DB && !FIXTURE ? "已比对" : "未比对，本地加 --db 执行"}）`);
console.log("✅ CG6 通过（src/** 与 scripts/tools/** 零 SQL 引用已退役的 crm_commodity_groups 及其退役名）");
