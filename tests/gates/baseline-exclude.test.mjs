/**
 * 自测：结构基线排除清单（baseline-exclude.mjs）——把「哪些表属切换窗口临时物」钉成可执行规格。
 * 用法：node --test tests/gates/baseline-exclude.test.mjs
 *
 * 目的：影子表蓝绿切换后，若漏改排除清单会把半成品/退役结构写进 baseline.sql（2026-10-12 踩过）。
 *   本测试锁死每一条后缀口径，并显式钉住 __gs / __legacy（2026-10-16 供应商退役批次补入），
 *   使其无法在后续改动中被无声删除。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isExcludedTable, EXCLUDE_RES } from "../../scripts/tools/baseline-exclude.mjs";

const MUST_EXCLUDE = [
  "crm_bid_notices__new", // ADR-0003 在途影子
  "crm_bid_opportunities__new",
  "crm_notice_attribution_nodes__drill", // ADR-0014 对拍/回滚演练
  "appointments__gs", // 供应商退役：在途影子
  "appointments__gs_dropped", // 回滚残留
  "supplier__legacy", // 观察期保留
  "crm_x__bak_20261015", // 一次性备份快照
  "crm_y_bak1",
  "crm_z_old",
  "crm_w_backup_2026",
  "crm_v_copy",
  "crm_u_retired_2026",
  "crm_outreach_supplier", // 内网爬虫镜像表
];

const MUST_KEEP = [
  "crm_bid_notices",
  "crm_bid_opportunities",
  "crm_notice_search",
  "supplier",
  "crm_users",
  "crm_plan_benefits",
  "crm_upload_files",
];

test("影子/备份/镜像表全部命中排除清单", () => {
  for (const t of MUST_EXCLUDE) {
    assert.ok(isExcludedTable(t), `应排除却未排除：${t}`);
  }
});

test("终态业务表不得被误排除", () => {
  for (const t of MUST_KEEP) {
    assert.ok(!isExcludedTable(t), `不应排除却被排除：${t}`);
  }
});

test("回归锁：__gs / __legacy 后缀必须在清单里（供应商退役批次补入）", () => {
  const src = EXCLUDE_RES.map(String).join("\n");
  assert.match(src, /__gs/, "__gs 排除被删除会导致影子表泄进基线");
  assert.match(src, /__legacy/, "__legacy 排除被删除会导致观察期保留表泄进基线");
});

test("EXCLUDE 环境变量追加口径与内置取并集", () => {
  assert.ok(!isExcludedTable("tmp_scratch"));
  assert.ok(isExcludedTable("tmp_scratch", [/^tmp_/]));
});
