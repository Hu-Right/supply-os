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

/** 假基线：本表已无批次一那三列（= 已退役），其余在册列保留。
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
