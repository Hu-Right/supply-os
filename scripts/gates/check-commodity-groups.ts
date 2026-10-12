/**
 * 品目大类门禁 CG1~CG7
 *
 * @script scripts/gates/check-commodity-groups.ts
 * @assertions
 *   CG1 大类恰为 32 个（口径源 EXPECTED_COMMODITY_GROUP_COUNT），且码形制为 UGT-G-NN
 *   CG2 段前缀形制合法（2 位数字）
 *   CG3 一段只属一类（常量侧；库侧等价断言由 BB3/BB4 对骨架树逐段做）
 *   CG4 每类 name_zh 非空
 *   CG5（仅 --db）**树反推**的段归属与常量逐项一致（两个方向，且反推唯一），库内大类码域恰为 32 个
 *      （旧树 crm_commodity_nodes 下线后，品目面 58 段对账改由 backbone 门禁 BB4/BB7 守，本项打印跳过）
 *   CG6（静态）src/** 与 scripts/tools/** 不得用 SQL 读已退役的大类维表族
 *      （crm_commodity_groups / crm_commodity_group_segments，含改名后的退役名）——「这两张表可以删」的机器证明
 *   CG7（仅 --db）大类维表族已退役：上述两表及其 retired 变体都不许在场
 * @limits 静态部分必须能在无 MySQL 的 CI（quality-gate job 没有库）里跑；CG5/CG7 是本地/发布前闸口。
 * @usage  npx tsx scripts/gates/check-commodity-groups.ts [--db]
 * @see    docs/adr/0008-commodity-groups-table-retirement.md（大类维表退役）
 * @see    docs/adr/0009-commodity-group-segments-table-retirement.md（段归属表退役 → CG5 改成对树反推）
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

// ── CG6 大类维表族零引用（静态，无库也能跑；CI 与本地同一道闸）──
// crm_commodity_groups（ADR-0008）与 crm_commodity_group_segments（ADR-0009）先后退役：32 类身份的唯一
// 事实源是常量 + 骨架树 crm_commodity_backbone（L1 行 + 逐行冗余的 group_code）。
// 只抓 SQL 语境（FROM / JOIN + 表名），不把注释里的历史提及算违规；`groups?` 配后缀 \w* 让
// 「crm_commodity_group_segments」与「改名成 retired_* 再读」都算违规——`_` 在正则里是单词字符，
// 拿 \b 收尾会让改名等于豁免（同 BB8 写法）。
// 扫描根：src/**（随包运行）+ scripts/tools/**（长期在用的工具）。不含 scripts/gates 自身（本文件用字符串
// 字面量做自检，扫自己必误伤），也不含 scripts/ops（一次性连库脚本，已由 check-gitignore-consistency 强制不入库）。
// scripts/forensics/** 也不在扫描根：那里放「拿退役维表跟常量逐段对账」的取证留档（ADR-0009/0011 引用的实测出处），
// 读退役表正是它们的用途、不构成口径来源；留在 scripts/ 下是为了吃满 tsconfig 的 **/*.ts 类型覆盖（temp/runtime 都被 exclude）。
// 把这类探针放回 scripts/tools 会让本闸立刻红（CI 的 test:css-compat →「真实常量应通过」，2026-10-12 实到）。
const RETIRED_RE = /\b(?:FROM|JOIN)\s+`?(?:\w+`?\.)?`?crm_commodity_groups?\w*\b/i;
// 断言自身不许哑火：四条自检分别钉住「改名不豁免」「库名限定不豁免」「段归属表也在禁列」「不误伤新树」
if (!RETIRED_RE.test("SELECT 1 FROM crm_commodity_groups_retired_20261012")) {
  problems.push("CG6 自检失败：正则匹配不到改名后的大类维表，这条断言已哑火");
}
if (!RETIRED_RE.test("SELECT 1 FROM crm.crm_commodity_groups")) {
  problems.push("CG6 自检失败：带库名限定的退役表名没被抓到");
}
if (!RETIRED_RE.test("SELECT 1 FROM crm_commodity_group_segments")) {
  problems.push("CG6 自检失败：段归属表没进禁列（它已在 ADR-0009 一并退役）");
}
if (RETIRED_RE.test("SELECT 1 FROM crm_commodity_backbone")) {
  problems.push("CG6 自检失败：正则把新树误判成退役表");
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
    `CG6 有 ${hits.length} 个文件仍用 SQL 读已退役的大类维表族：` +
      `${hits.map((h) => h.split(/[\\/]/).slice(-2).join("/")).join("、")}` +
      ` ⇒ 32 类口径改从常量 + 骨架树取（见 ADR-0008 / ADR-0009）`,
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

  // 段→大类：从骨架上反推（归属表 crm_commodity_group_segments 已按 ADR-0009 退役）。
  // 依据是逐行冗余的 group_code：门禁 BB4 断言「段所属大类 == 类行 group_code == 祖先 L1 的 group_code」，
  // 所以「一个段的全部 L4 行指向同一个大类」是受断言保护的不变量。这里把唯一性显式量出来（kinds），
  // 不用 MIN() 直接取值——那样会把「一段跨多大类」的退化掩盖成一个看起来正常的数。
  // 不按 status 过滤：段归属是结构事实，不是可见性开关（退役前的归属表同样不带 status）。
  const [rows] = (await pool.query(
    `SELECT LEFT(unspsc_prefix, 2) AS seg, COUNT(DISTINCT group_code) AS kinds, MIN(group_code) AS g
       FROM crm_commodity_backbone
      WHERE level = 4 AND unspsc_prefix IS NOT NULL AND CHAR_LENGTH(unspsc_prefix) = 6
      GROUP BY LEFT(unspsc_prefix, 2) ORDER BY seg`,
  )) as [Array<{ seg: string; kinds: number; g: string }>, unknown];
  const dbMap = new Map(rows.map((r) => [r.seg, r.g]));
  for (const r of rows) {
    if (Number(r.kinds) !== 1) {
      problems.push(`CG5 段 ${r.seg} 的类行落在 ${r.kinds} 个大类上：树反推不唯一（BB4 该报红）`);
    }
  }

  for (const g of groups) {
    for (const p of g.prefixes) {
      const got = dbMap.get(p);
      if (!got) problems.push(`CG5 段 ${p} 在树里推不出归属（常量=${g.code}）`);
      else if (got !== g.code) problems.push(`CG5 段 ${p} 树反推=${got}，常量=${g.code}`);
    }
  }
  for (const [p, g] of dbMap) {
    if (!groups.some((x) => x.prefixes.includes(p))) problems.push(`CG5 树里多出段 ${p}→${g}，常量里没有`);
  }

  // 大类码域：骨架 L1 的 group_code 去重后必须恰好是常量那 32 个。退役前这条由「读两张维表逐行比」承担
  // （ADR-0008/0009）；维表族都没了之后，库侧能验的就是「码域 + 段归属」——两者合起来已足以证明
  // 「库里没有常量之外的类」：任何多出来的码都得挂在某个段前缀上，而段前缀已被上面两个方向逐一钉死。
  const [dom] = (await pool.query(
    `SELECT COUNT(DISTINCT group_code) c FROM crm_commodity_backbone WHERE level = 1`,
  )) as [Array<{ c: number }>, unknown];
  const domCount = Number(dom[0]!.c);
  if (domCount !== EXPECTED_COMMODITY_GROUP_COUNT) {
    problems.push(
      `CG5 骨架 L1 的大类码 ${domCount} 个，应为 ${EXPECTED_COMMODITY_GROUP_COUNT}（码域缺项或串位）`,
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

  // ── CG7 大类维表族退役不变量（ADR-0008 / ADR-0009）──
  // 两个名字都不许在场：正名在场 = 退役没做完；retired_* 在场 = 改名改一半（ADR-0006 对旧树的同款理由：
  // 「退役」不允许停留在口头，也不允许停在中间态）。报错里直接给出收尾与回滚两条命令，不留给下一个人猜。
  const [stillThere] = (await pool.query(
    `SELECT TABLE_NAME t FROM information_schema.TABLES
      WHERE table_schema = DATABASE() AND TABLE_NAME REGEXP '^crm_commodity_group'`,
  )) as [Array<{ t: string }>, unknown];
  if (stillThere.length) {
    problems.push(
      `CG7 大类维表族仍在库里：${stillThere.map((r) => r.t).join("、")}` +
        ` ⇒ 两张表已分别按 ADR-0008（crm_commodity_groups）与 ADR-0009（crm_commodity_group_segments）退役，` +
        `32 类身份改由常量 + 骨架树承载。` +
        `收尾：npx tsx scripts/ops/commodity-groups-retire.ts --apply --yes（或 …-segments-retire.ts）；` +
        `回滚：把 runtime/commodity-group*-dump-*.sql 回灌`,
    );
  }

  console.log(
    `DB：树反推段归属 ${dbMap.size} 段 / 骨架 L1 大类码 ${domCount} 个 / ` +
      `品目面段 ${segCount === null ? "—（旧树已下线，无对照物）" : `${segCount} 段`} / ` +
      `大类维表族 ${stillThere.length ? "⚠ 仍在场" : "已退役"}`,
  );
  await pool.end();
}

if (problems.length) {
  console.error("❌ 品目大类门禁未通过：");
  for (const p of [...new Set(problems)]) console.error("  - " + p);
  process.exit(1);
}
console.log(`✅ CG1~CG4 通过（${groups.length} 类；DB 侧 ${DB && !FIXTURE ? "已比对" : "未比对，本地加 --db 执行"}）`);
console.log("✅ CG6 通过（src/** 与 scripts/tools/** 零 SQL 引用已退役的大类维表族及其退役名）");
