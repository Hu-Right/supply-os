/**
 * 桥表→落点增量镜像的分支覆盖（红线：只压回最深落点、脏列/树外整条不落、B=0 零写入）
 *
 * mocked pool 按 SQL 关键字分派：树 SELECT 返回固定 5 级链、公告候选一次后返空、INSERT 记参数并回 affectedRows。
 * 断言的是「会不会误改归属 / 造冗余 / 造幻觉」这些静默毁事实源的分支。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool } from "mysql2/promise";

vi.mock("server-only", () => ({}));

import { runAttributionMirror } from "@/lib/services/commodity/attribution-mirror";
import { resetBackboneCache } from "@/lib/services/commodity/backbone-cache";

const TREE_ROWS = [
  { code: "UGT-01", parent_code: "", level: 1, group_code: "UGT-G-01" },
  { code: "UGT-0101", parent_code: "UGT-01", level: 2, group_code: "UGT-G-01" },
  { code: "UGT-010101", parent_code: "UGT-0101", level: 3, group_code: "UGT-G-01" },
  { code: "UGT-01010101", parent_code: "UGT-010101", level: 4, group_code: "UGT-G-01" },
  { code: "UGT-0101010101", parent_code: "UGT-01010101", level: 5, group_code: "UGT-G-01" },
];

function makePool(candidates: Array<{ pk: number; col: string }>) {
  let selectSeq = 0;
  const inserts: unknown[][] = [];
  const query = vi.fn(async (sql: string, params: unknown = null) => {
    const s = String(sql);
    if (/FROM crm_commodity_backbone/.test(s)) return [TREE_ROWS];
    if (/FROM crm_notice_search/.test(s)) { selectSeq++; return [selectSeq === 1 ? candidates : []]; }
    if (/INSERT IGNORE INTO crm_notice_attribution_nodes/.test(s)) {
      const p = (params ?? []) as unknown[];
      inserts.push(p);
      return [{ affectedRows: p.length / 3 }]; // 每行 3 个绑定参数
    }
    return [[]];
  });
  return { pool: { query } as unknown as Pool, inserts };
}

describe("runAttributionMirror", () => {
  beforeEach(() => resetBackboneCache());

  it("闭包稳定且全树内的列 → 只压回最深落点；脏列 / 树外整条跳过", async () => {
    const { pool, inserts } = makePool([
      { pk: 1, col: "UGT-01,UGT-0101,UGT-010101,UGT-01010101,UGT-0101010101" }, // 有效 ⇒ 落点仅 [UGT-0101010101]
      { pk: 2, col: "UGT-01,UGT-010101" },                                       // 缺祖先 ⇒ 闭包不稳定 ⇒ 脏列跳过
      { pk: 3, col: "UGT-99,UGT-9901" },                                          // 闭包稳定但含树外码 ⇒ phantom 跳过
    ]);
    const r = await runAttributionMirror(pool, { batch: 100, maxNotices: 100 });
    expect(r.scanned).toBe(3);
    expect(r.seededNotices).toBe(1);
    expect(r.skippedDirty).toBe(1);
    expect(r.skippedPhantom).toBe(1);
    expect(r.writtenRows).toBe(1);
    const flat = inserts.flat(1).map(String);
    expect(flat).toContain("UGT-0101010101"); // 只写最深叶子
    expect(flat).not.toContain("UGT-010101");  // 不写祖先（落点只存最深，祖先派生补）
    expect(flat).not.toContain("UGT-9901");    // 树外整条不落
  });

  it("无候选（B=0，落点已覆盖列值）→ 零 INSERT 写入", async () => {
    const { pool, inserts } = makePool([]);
    const r = await runAttributionMirror(pool);
    expect(r.scanned).toBe(0);
    expect(r.writtenRows).toBe(0);
    expect(inserts.length).toBe(0);
  });
});
