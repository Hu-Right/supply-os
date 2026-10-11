/**
 * findSimilarNotices：验证「无码/无候选 → 空数组」短路 + 候选/节点码/水合三段查询串联。
 * 排序正确性已在 similar-scoring.test.ts 覆盖，此处只测编排、短路和检索口径。
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

// 当前公告：链顶 UGT-B-07 + 中类 UGT-B-0702（列值祖先全存）
const CUR_PATH = [{ p: "UGT-B-07,UGT-B-0702" }];

describe("findSimilarNoticeIds", () => {
  it("按分数降序返回 peer notice_id", async () => {
    const { pool } = makePool([
      [/FROM crm_bid_notices n WHERE n\.id/, [{ notice_id: "CUR" }]],
      [/FROM crm_notice_search WHERE id = \?/, CUR_PATH],
      [/peer\.code = cur\.code/, [
        { notice_id: "A", wide_id: 11, deadline_ts: 100 },
        { notice_id: "B", wide_id: 12, deadline_ts: 100 },
      ]],
      [/FROM crm_notice_search WHERE id IN/, [
        { id: 11, p: "UGT-B-07,UGT-B-0702" },
        { id: 12, p: "UGT-B-07" },
      ]],
    ]);
    // 两侧都只取叶子做代表：A 共享到中类（0.6），B 只共享到大类（0.4）
    expect(await findSimilarNoticeIds(pool, 1, 6)).toEqual(["A", "B"]);
  });

  it("检索走「共享原始码」，不再读旧字典五列、不再按桥表 level 选分支（D-6）", async () => {
    const { pool, query } = makePool([
      [/FROM crm_bid_notices n WHERE n\.id/, [{ notice_id: "CUR" }]],
      [/FROM crm_notice_search WHERE id = \?/, CUR_PATH],
      [/peer\.code = cur\.code/, []],
    ]);
    await findSimilarNoticeIds(pool, 1, 6);
    const peerSql = String(query.mock.calls.find((c) => /peer\.code/.test(String(c[0])))?.[0] || "");
    expect(peerSql).toContain("peer.code = cur.code");
    expect(peerSql).not.toMatch(/level[1-5]_id/);
    expect(peerSql).not.toContain("cur.level");
  });

  it("当前公告有码但宽表尚未挂靠（backbone_path 为空）→ 空数组，不猜相似", async () => {
    const { pool, query } = makePool([
      [/FROM crm_bid_notices n WHERE n\.id/, [{ notice_id: "CUR" }]],
      [/FROM crm_notice_search WHERE id = \?/, [{ p: null }]],
    ]);
    expect(await findSimilarNoticeIds(pool, 1, 6)).toEqual([]);
    expect(query.mock.calls.some((c) => /peer\.code/.test(String(c[0])))).toBe(false);
  });

  it("候选有行但宽表一个都查不到 → 空数组（不用空节点码硬凑分数）", async () => {
    const { pool } = makePool([
      [/FROM crm_bid_notices n WHERE n\.id/, [{ notice_id: "CUR" }]],
      [/FROM crm_notice_search WHERE id = \?/, CUR_PATH],
      [/peer\.code = cur\.code/, [{ notice_id: "A", wide_id: 11, deadline_ts: 1 }]],
      [/FROM crm_notice_search WHERE id IN/, []],
    ]);
    expect(await findSimilarNoticeIds(pool, 1, 6)).toEqual([]);
  });
});

describe("findSimilarNotices", () => {
  it("当前公告无节点码 → 返回空数组，且不进入候选/水合查询（无兜底）", async () => {
    const { pool, query } = makePool([
      [/FROM crm_bid_notices n WHERE n\.id/, [{ notice_id: "CUR" }]],
      [/FROM crm_notice_search WHERE id = \?/, []],
    ]);
    const res = await findSimilarNotices(pool, 1, 6, "zh");
    expect(res).toEqual([]);
    expect(query.mock.calls.length).toBeLessThanOrEqual(2); // 未进入候选/水合查询
  });

  it("有候选时水合并返回 NoticeListItem 形状（含 title_i18n/country/deadline_ts，不外泄内部列）", async () => {
    const { pool } = makePool([
      [/FROM crm_bid_notices n WHERE n\.id/, [{ notice_id: "CUR" }]],
      [/FROM crm_notice_search WHERE id = \?/, CUR_PATH],
      [/peer\.code = cur\.code/, [{ notice_id: "A", wide_id: 11, deadline_ts: 1790000000 }]],
      [/FROM crm_notice_search WHERE id IN/, [{ id: 11, p: "UGT-B-07,UGT-B-0702" }]],
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
