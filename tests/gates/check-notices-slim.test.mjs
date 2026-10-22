/**
 * 门禁自测：证明公告主表精简守卫真的会拦，而不是永远绿
 * 口径同 check-opp-slim.test.mjs（用环境变量把扫描根与基线换成 fixture）。
 *
 * 关键设计：守卫的「已退役」判定来自 baseline 现结构 ∩ 批次登记，所以自测必须能
 * 喂一份假 baseline，否则会退化成「只在删列前绿、删列后没人验过」。
 * 用法：node --test tests/gates/check-notices-slim.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const GATE = join(ROOT, "scripts", "gates", "check-notices-slim.mjs");

function run(env = {}) {
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, [GATE], { encoding: "utf8", env: { ...process.env, ...env } }),
    };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

function fixture(entries) {
  const root = mkdtempSync(join(tmpdir(), "noticesslim-"));
  for (const [rel, content] of Object.entries(entries)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  return root;
}

/** 假基线：本表已无批次一两列（thresholds / ai_products）与 response_count，
 * 也没有 category_l2_id（它由**并行影子表轮**摘除、不经本仓阶段脚本）；
 * 但保留 category_l1_id（用来验证「还在场的列不算退役」）。
 * 注意 ai_products 必须只留在商机表那侧，否则它就不算退役，NS2 不误伤的用例会变成空跑。 */
const BASELINE_DROPPED = [
  "-- fixture",
  "CREATE TABLE `crm_bid_notices` (",
  "  `id` int NOT NULL AUTO_INCREMENT,",
  "  `title` varchar(500) DEFAULT NULL,",
  "  `is_converted` tinyint(1) NOT NULL DEFAULT '0',",
  "  `is_qualified` tinyint(1) DEFAULT '0',",
  "  `category_l1_id` int unsigned DEFAULT NULL,",
  ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='招标公告表。';",
  "",
  "CREATE TABLE `crm_bid_opportunities` (",
  "  `id` int unsigned NOT NULL AUTO_INCREMENT,",
  "  `ai_products` json DEFAULT NULL,",
  ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商机表（人工拆单）';",
  "",
].join("\n");

/** 假基线二：连 is_qualified 也已退役（批次四落库后的形状），用来验「人工豁免」只拓登记的那一个文件。
 * 与 BASELINE_DROPPED 的唯一差别就是少 `is_qualified` 一行。 */
const BASELINE_QUALIFIED_GONE = BASELINE_DROPPED.replace("  `is_qualified` tinyint(1) DEFAULT '0',\n", "");

/** 判据①的真实命中形制：同一条字面量里既有 crm_bid_notices（子查询）又有 o.is_qualified（商机列）。
 * 这是 AI 链路逐行看过的误报形态，两条豁免登记的就是它。 */
const OPP_SIDE_SQL = [
  "export const q = `SELECT o.eligibility FROM crm_bid_opportunities o",
  "  WHERE o.source_notice_id = (SELECT notice_id FROM crm_bid_notices WHERE id = ? LIMIT 1)",
  "  AND (o.is_qualified = 1 OR o.status = 1)`;",
].join("\n");

/** v2 服务表构建器里 is_opportunity 的 CASE 表达式：同一条字面量既有
 * `FROM crm_bid_notices n` 又有 `crm_bid_opportunities o` 子查询里的 `o.is_qualified`。
 * 与 OPP_SIDE_SQL 同一误报形制，取的是商机侧列，本表那份零读取。 */
const V2_OPP_SIDE_SQL = [
  "export const rows = await q(`SELECT n.id,",
  "  CASE WHEN EXISTS (SELECT 1 FROM crm_bid_opportunities o",
  "    WHERE (o.id = n.converted_opp_id OR o.source_notice_id = n.notice_id)",
  "      AND (o.is_qualified = 1 OR o.status = 1 OR o.audit_status = 1)) THEN 1 ELSE 0 END AS is_opportunity",
  "  FROM crm_bid_notices n WHERE n.id IN (?)`);",
].join("\n");

test("已登记豁免的文件：门禁绿，且成功行必把豁免条数说出来（豁免不得隐身）", () => {
  const root = fixture({
    "db/schema/baseline.sql": BASELINE_QUALIFIED_GONE,
    "src/lib/services/ai-summary/index.ts": OPP_SIDE_SQL,
  });
  const r = run({ NOTICES_SLIM_SCAN_ROOT: root, NOTICES_SLIM_BASELINE: join(root, "db/schema/baseline.sql") });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /人工豁免 1 处（is_qualified）/, "豁免生效了却没报告，等于静默放宽判据");
});

test("已登记的 v2 服务表构建器：商机侧误报走豁免，门禁绿且报告豁免条数", () => {
  // 复现 v2 里 is_opportunity CASE 表达式的误报形制：scripts/ops/ 下的构建器
  // 同一条字面量提及 crm_bid_notices 与 o.is_qualified（商机侧），已逐行核过非本表读写点。
  const root = fixture({
    "db/schema/baseline.sql": BASELINE_QUALIFIED_GONE,
    "scripts/ops/notice-public-v2.ts": V2_OPP_SIDE_SQL,
  });
  const r = run({ NOTICES_SLIM_SCAN_ROOT: root, NOTICES_SLIM_BASELINE: join(root, "db/schema/baseline.sql") });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /人工豁免 1 处（is_qualified）/, "v2 豁免生效了却没报告，等于静默放宽判据");
});

test("豁免不得连带放行：同样形态出现在未登记的文件里必须照旧拦", () => {
  const root = fixture({
    "db/schema/baseline.sql": BASELINE_QUALIFIED_GONE,
    "src/lib/services/ai-summary/index.ts": OPP_SIDE_SQL,
    "src/lib/services/ai/other-copy.ts": OPP_SIDE_SQL,
  });
  const r = run({ NOTICES_SLIM_SCAN_ROOT: root, NOTICES_SLIM_BASELINE: join(root, "db/schema/baseline.sql") });
  assert.equal(r.code, 1, "豁免被当成了按列放行：未登记文件的同样引用没被拦住");
  assert.match(r.out, /ai\/other-copy\.ts/);
  assert.doesNotMatch(r.out, /ai-summary/, "已登记豁免的文件不得出现在报错里");
});

test("真实仓应通过（批次尚未落库时，门禁按现结构空转）", () => {
  const r = run();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /公告主表精简守卫通过/);
});

test("NS1 破坏性：本表 SQL 重新 SELECT 已退役列必须报错（列已从库里消失）", () => {
  const root = fixture({
    "db/schema/baseline.sql": BASELINE_DROPPED,
    "src/lib/repos/notices/notice-detail.repo.ts": [
      "export const q = `SELECT id, title, thresholds, response_count",
      "  FROM crm_bid_notices WHERE id = ? LIMIT 1`;",
    ].join("\n"),
  });
  const r = run({ NOTICES_SLIM_SCAN_ROOT: root, NOTICES_SLIM_BASELINE: join(root, "db/schema/baseline.sql") });
  assert.equal(r.code, 1, "已退役列被重新 SELECT 没有被拦住");
  assert.match(r.out, /\[NS1\].*thresholds/);
  assert.match(r.out, /\[NS1\].*response_count/);
});

test("NS2 破坏性：无兄弟同名列的退役列，全域代码行都得拦", () => {
  const root = fixture({
    "db/schema/baseline.sql": BASELINE_DROPPED,
    "src/features/procurement/api/notices.ts": ["export const pick = (r: any) => r.response_count ?? 0;"].join("\n"),
  });
  const r = run({ NOTICES_SLIM_SCAN_ROOT: root, NOTICES_SLIM_BASELINE: join(root, "db/schema/baseline.sql") });
  assert.equal(r.code, 1, "全域引用已退役列没有被拦住");
  assert.match(r.out, /\[NS2\].*response_count/);
});

test("兄弟表同名列不得被 NS2 误伤（ai_products 在商机表仍在用）", () => {
  const root = fixture({
    "db/schema/baseline.sql": BASELINE_DROPPED,
    "src/lib/services/bid-report/merge.ts": ["export const row = { ai_products: opp.ai_products };"].join("\n"),
  });
  const r = run({ NOTICES_SLIM_SCAN_ROOT: root, NOTICES_SLIM_BASELINE: join(root, "db/schema/baseline.sql") });
  assert.equal(r.code, 0, r.out);
});

test("注释不得误报（历史留痕的退役列名不是读写点）", () => {
  const root = fixture({
    "db/schema/baseline.sql": BASELINE_DROPPED,
    "src/lib/services/notices/featured.ts": [
      "// 历史：thresholds / ai_products / response_count 已于批次一退役，见 notices-slim-plan.mjs",
      "export const fields = `id, title`;",
    ].join("\n"),
  });
  const r = run({ NOTICES_SLIM_SCAN_ROOT: root, NOTICES_SLIM_BASELINE: join(root, "db/schema/baseline.sql") });
  assert.equal(r.code, 0, r.out);
});

/**
 * 并行影子表轮摘掉的列不经过本仓阶段脚本，因此必须靠 PARALLEL_DROPPED_COLUMNS 进退役集。
 * 这条用例守的是一个具体缺口：2026-10-15 实测到另一作业正在建同名 __new 摘 category_l1_id/l2_id/
 * response_count。如果没有这条覆盖，对方落库重导 baseline 后，本仓门禁对这类列就是空的——
 * 有人重新 `ADD COLUMN category_l2_id` 并把代码接回去也不会报错。
 * 同时反证「还在基线里的列不算退役」（category_l1_id 在本 fixture 里保留，不得报错）。
 */
test("并行轮次摘除的列同样不得复活（且在场列不被误判为退役）", () => {
  const root = fixture({
    "db/schema/baseline.sql": BASELINE_DROPPED,
    "src/lib/services/search-sync/wide-row-builder.ts": [
      "export const noticesSql = `SELECT id FROM crm_bid_notices`;",
      "export const wideSel = `n.category_l2_id, n.category_l1_id`;",
    ].join("\n"),
  });
  const r = run({ NOTICES_SLIM_SCAN_ROOT: root, NOTICES_SLIM_BASELINE: join(root, "db/schema/baseline.sql") });
  assert.equal(r.code, 1, "并行轮次摘除的列被重新引用，却没有被拦住");
  assert.match(r.out, /category_l2_id/);
  // 只卡「被当成退役列」这个判定，不卡命中样本（样本里会副带同级其它列名，包络不同会假绿）
  assert.doesNotMatch(r.out, /已退役列 `category_l1_id`/, "仍在基线里的列不得被当成退役列");
});
