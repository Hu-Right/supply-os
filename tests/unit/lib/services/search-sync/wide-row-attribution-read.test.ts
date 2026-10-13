/**
 * R2 切读入口 loadBackboneMap 的分支覆盖（flag 默认关 ⇒ 现网零变化的机器证明）
 *
 * 断言的是「来源切换」这几条会静默改变分类结果的分支：
 *   - ATTRIBUTION_READ=on：读落点表、按最深落点补全祖先、以 notice_id 为 key 回形；
 *   - 有落点 vs 无落点（空 ⇒ buildWideRow 转 NULL）；
 *   - 没带 pk 的调用方 / flag 关 ⇒ 退回 loadUnspscByNoticeIds（桥表），绝不误清空。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Pool } from "mysql2/promise";

vi.mock("server-only", () => ({}));

import { loadBackboneMap } from "@/lib/services/search-sync/wide-row-builder";
import { resetBackboneCache } from "@/lib/services/commodity/backbone-cache";

function makePool(byKeyword: Array<[RegExp, unknown[][]]>) {
  const query = vi.fn(async (sql: string, _values: unknown = null) => {
    const s = String(sql);
    for (const [re, batches] of byKeyword) if (re.test(s)) return [batches.shift() ?? []];
    return [[]];
  });
  return { pool: { query } as unknown as Pool, query };
}
const TREE = () => [[
  { code: "UGT-01", parent_code: "", level: 1, unspsc_prefix: null, group_code: "UGT-G-01" },
  { code: "UGT-0101", parent_code: "UGT-01", level: 2, unspsc_prefix: null, group_code: "UGT-G-01" },
  { code: "UGT-010101", parent_code: "UGT-0101", level: 3, unspsc_prefix: null, group_code: "UGT-G-01" },
  { code: "UGT-01010101", parent_code: "UGT-010101", level: 4, unspsc_prefix: "101015", group_code: "UGT-G-01" },
  { code: "UGT-0101010101", parent_code: "UGT-01010101", level: 5, unspsc_prefix: "10101504", group_code: "UGT-G-01" },
]];

describe("loadBackboneMap（R2 切读入口）", () => {
  beforeEach(() => resetBackboneCache());
  afterEach(() => { delete process.env.ATTRIBUTION_READ; });

  it("flag on：读落点表，按最深落点补全祖先，以 notice_id 为 key 回列形制", async () => {
    process.env.ATTRIBUTION_READ = "on";
    const { pool, query } = makePool([
      [/FROM crm_notice_attribution_nodes WHERE notice_pk IN/, [[{ notice_pk: 1, node_code: "UGT-0101010101" }]]],
    ]);
    const r = (await loadBackboneMap(pool, [{ noticeId: "N1", pk: 1 }])).get("N1")!;
    expect(r.backbone).toBe("UGT-01,UGT-0101,UGT-010101,UGT-01010101,UGT-0101010101");
    // 走落点表 ⇒ 不碰桥表、不碰旧树
    expect(query.mock.calls.some((c) => /crm_bid_notice_unspsc_codes/.test(String(c[0])))).toBe(false);
    for (const c of query.mock.calls) expect(String(c[0])).not.toContain("crm_commodity_nodes");
  });

  it("flag on：落点表无该公告行 → backbone 空串（交 buildWideRow 写 NULL，不臆测）", async () => {
    process.env.ATTRIBUTION_READ = "on";
    const { pool } = makePool([[/FROM crm_notice_attribution_nodes/, [[]]]]);
    const r = (await loadBackboneMap(pool, [{ noticeId: "N1", pk: 1 }])).get("N1")!;
    expect(r.backbone).toBe("");
  });

  it("flag on 但调用方没带 pk → 退回桥表装载，绝不静默清空", async () => {
    process.env.ATTRIBUTION_READ = "on";
    const { pool, query } = makePool([
      [/FROM crm_bid_notice_unspsc_codes/, [[{ notice_id: "N1", code: "10101504" }]]],
      [/FROM crm_commodity_backbone WHERE status = 1/, TREE()],
    ]);
    const r = (await loadBackboneMap(pool, [{ noticeId: "N1" }])).get("N1")!;
    expect(r.backbone).toBe("UGT-01,UGT-0101,UGT-010101,UGT-01010101,UGT-0101010101");
    expect(query.mock.calls.some((c) => /crm_bid_notice_unspsc_codes/.test(String(c[0])))).toBe(true);
  });

  it("flag 关（默认）：完全走 loadUnspscByNoticeIds（桥表），现网行为零变化", async () => {
    const { pool, query } = makePool([
      [/FROM crm_bid_notice_unspsc_codes/, [[{ notice_id: "N1", code: "10101504" }]]],
      [/FROM crm_commodity_backbone WHERE status = 1/, TREE()],
    ]);
    const r = (await loadBackboneMap(pool, [{ noticeId: "N1", pk: 1 }])).get("N1")!;
    expect(r.backbone).toBe("UGT-01,UGT-0101,UGT-010101,UGT-01010101,UGT-0101010101");
    // flag 关 ⇒ 即便带了 pk 也不查落点表
    expect(query.mock.calls.some((c) => /crm_notice_attribution_nodes/.test(String(c[0])))).toBe(false);
  });

  it("空 sources → 零查询", async () => {
    process.env.ATTRIBUTION_READ = "on";
    const { pool, query } = makePool([]);
    expect((await loadBackboneMap(pool, [])).size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
});
