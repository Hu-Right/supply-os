/**
 * findSimilarNotices：验证「无码/无候选 → 空数组」短路 + 候选/水合两查询串联。
 * 排序正确性已在 similar-scoring.test.ts 覆盖，此处只测编排与短路。
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import { findSimilarNotices, findSimilarNoticeIds } from "@/lib/services/notices/similar";

/** 按 SQL 关键字分派返回行数组（未命中返回空集） */
function makePool(byKeyword: Array<[RegExp, unknown[]]>) {
  const query = vi.fn(async (sql: string) => {
    for (const [re, rows] of byKeyword) if (re.test(String(sql))) return [rows];
    return [[]];
  });
  return { pool: { query } as unknown as Pool, query };
}

describe("findSimilarNoticeIds", () => {
  it("按分数降序返回 peer notice_id", async () => {
    const { pool } = makePool([
      [/FROM crm_bid_notices n\s+WHERE n\.id/, [{ notice_id: "CUR" }]],
      [/FROM crm_bid_notice_unspsc_codes WHERE notice_id/, [{ level1_id: "1", level2_id: "", level3_id: "", level4_id: "", level5_id: "" }]],
      [/peer/, [
        { notice_id: "A", level1_id: "1", level2_id: "", level3_id: "", level4_id: "", level5_id: "" },
        { notice_id: "B", level1_id: "1", level2_id: "", level3_id: "", level4_id: "", level5_id: "" },
      ]],
    ]);
    const ids = await findSimilarNoticeIds(pool, 1, 6);
    expect(ids).toEqual(["A", "B"]);
  });
});

describe("findSimilarNotices", () => {
  it("当前公告无 UNSPSC 码 → 返回空数组，且不进入候选/水合查询（无兜底）", async () => {
    const { pool, query } = makePool([
      [/FROM crm_bid_notices n\s+WHERE n\.id/, [{ notice_id: "CUR" }]],
      [/FROM crm_bid_notice_unspsc_codes WHERE notice_id/, []],
    ]);
    const res = await findSimilarNotices(pool, 1, 6, "zh");
    expect(res).toEqual([]);
    expect(query.mock.calls.length).toBeLessThanOrEqual(2); // 未进入候选/水合查询
  });

  it("有候选时水合并返回 NoticeListItem 形状（含 title_i18n/country/deadline_ts，不外泄内部列）", async () => {
    const { pool } = makePool([
      [/FROM crm_bid_notices n\s+WHERE n\.id/, [{ notice_id: "CUR" }]],
      [/FROM crm_bid_notice_unspsc_codes WHERE notice_id/, [{ level1_id: "1", level2_id: "", level3_id: "", level4_id: "", level5_id: "" }]],
      [/peer/, [{ notice_id: "A", level1_id: "1", level2_id: "", level3_id: "", level4_id: "", level5_id: "" }]],
      [/FROM crm_bid_notices n[\s\S]*n\.notice_id IN/, [{
        id: 11, notice_id: "A", reference: "R-A", title: "标题A", title_i18n: "A中文", title_en: "Aen",
        notice_type: "Supply", country: "KE", deadline: "2026-10-01", deadline_ts: 1790000000,
        estimated_value: "USD 1", agency: "AG",
      }]],
    ]);
    const res = await findSimilarNotices(pool, 1, 6, "zh");
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ id: 11, title_i18n: "A中文", country: "KE", deadline_ts: 1790000000 });
    expect(res[0]).not.toHaveProperty("peer");
  });
});
