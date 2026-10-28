/**
 * 归属装载入口 loadBackboneMap 的行为覆盖（小表剥离后：落点表是唯一事实源）
 *
 * 断言的是「会静默改变分类结果」的分支：
 *   - 按 notice_pk 读 notice_attribution_nodes、以 notice_id 为 key 回列形制；
 *   - 有落点 vs 无落点（空 ⇒ buildWideRow 转 NULL，不臆测）；
 *   - 调用方没带 pk ⇒ 结果缺席（不退回桥表，交上游写 NULL）；
 *   - 空 sources ⇒ 零查询。
 * 旧品类桥表 / 旧字典的装载路径已随小表剥离删除（2026-10-14），不再出现在本文件断言中。
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";

vi.mock("server-only", () => ({}));

import { loadBackboneMap } from "@/lib/services/search-sync/wide-row-builder";

function makePool(byKeyword: Array<[RegExp, unknown[][]]>) {
  const query = vi.fn(async (sql: string, _values: unknown = null) => {
    const s = String(sql);
    for (const [re, batches] of byKeyword) if (re.test(s)) return [batches.shift() ?? []];
    return [[]];
  });
  return { pool: { query } as unknown as Pool, query };
}

describe("loadBackboneMap（落点表唯一入口）", () => {
  it("读落点表：按最深落点补全祖先，以 notice_id 为 key 回列形制", async () => {
    const { pool, query } = makePool([
      [/FROM notice_attribution_nodes WHERE notice_pk IN/, [[{ notice_pk: 1, node_code: "UGT-0101010101" }]]],
    ]);
    const r = (await loadBackboneMap(pool, [{ noticeId: "N1", pk: 1 }])).get("N1")!;
    expect(r.backbone).toBe("UGT-01,UGT-0101,UGT-010101,UGT-01010101,UGT-0101010101");
    // 走落点表⇒不碰旧桥表、不碰旧树（桥表按表族拦截，改名复活同样报错）
    expect(query.mock.calls.some((c) => /crm_bid_notice_\w*_codes\b/.test(String(c[0])))).toBe(false);
    for (const c of query.mock.calls) expect(String(c[0])).not.toContain("crm_commodity_nodes");
  });

  it("落点表无该公告行 → backbone 空串（交 buildWideRow 写 NULL，不臆测）", async () => {
    const { pool } = makePool([[/FROM notice_attribution_nodes/, [[]]]]);
    const r = (await loadBackboneMap(pool, [{ noticeId: "N1", pk: 1 }])).get("N1")!;
    expect(r.backbone).toBe("");
  });

  it("调用方没带 pk → 结果整体缺席（不发任何 SQL，交上游写 NULL，不退回桥表）", async () => {
    const { pool, query } = makePool([]);
    const m = await loadBackboneMap(pool, [{ noticeId: "N1" }]);
    expect(m.size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it("空 sources → 零查询", async () => {
    const { pool, query } = makePool([]);
    expect((await loadBackboneMap(pool, [])).size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
});
