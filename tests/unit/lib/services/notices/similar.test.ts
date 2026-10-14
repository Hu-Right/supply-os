/**
 * findSimilarNotices：验证「无行/无码/无候选 → 空数组」短路 + 节点深度分档优先 + 三段查询串联。
 * 排序正确性已在 similar-scoring.test.ts 覆盖，此处只测编排、短路和检索口径。
 * 小表剥离（2026-10-14）：候选检索改走倒排表 UGT 节点（peer.node IN），不再读桥表原始码。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import type { Pool } from "mysql2/promise";
import { findSimilarNotices, findSimilarNoticeIds } from "@/lib/services/notices/similar";

/** 按 SQL 关键字分派返回行数组（未命中返回空集）；调用参数可直接从 query.mock.calls 取 */
function makePool(byKeyword: Array<[RegExp, unknown[]]>) {
  // 形参必须留着（下划线前缀避开未用告警）：否则 mock.calls 元组只剩 1 位，取不到 params
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    for (const [re, rows] of byKeyword) if (re.test(String(sql))) return [rows];
    return [[]];
  });
  return { pool: { query } as unknown as Pool, query };
}

// 当前公告：链顶 UGT-07 + 中类 UGT-0702（列值祖先全存）
const CUR_PATH = [{ p: "UGT-07,UGT-0702" }];
// 多层夹具：L4 细码 + L3 小类 + L2 中类（L1 祖先不进检索）
const CUR_PATH_DEEP = [{ p: "UGT-07,UGT-0702,UGT-070201,UGT-07020102" }];

const ID_MAP: Array<[RegExp, unknown[]]> = [
  [/FROM crm_bid_notices n WHERE n\.id/, [{ notice_id: "CUR" }]],
];

describe("findSimilarNoticeIds", () => {
  afterEach(() => vi.restoreAllMocks());

  it("按分数降序返回 peer notice_id", async () => {
    const { pool } = makePool([
      ...ID_MAP,
      [/FROM crm_notice_search WHERE id = \?/, CUR_PATH],
      [/peer\.node IN/, [
        { notice_id: "A", wide_id: 11, deadline_ts: 100 },
        { notice_id: "B", wide_id: 12, deadline_ts: 100 },
      ]],
      [/FROM crm_notice_search WHERE id IN/, [
        { id: 11, p: "UGT-07,UGT-0702" },
        { id: 12, p: "UGT-07" },
      ]],
    ]);
    // 两侧都只取叶子做代表：A 共享到中类（0.6），B 只共享到大类（0.4）
    expect(await findSimilarNoticeIds(pool, 1, 6)).toEqual(["A", "B"]);
  });

  it("检索按节点深度分档：L4 先问、L3 次之、L2 最后，且后一轮窗口按已收集数收窄", async () => {
    const { pool, query } = makePool([
      ...ID_MAP,
      [/FROM crm_notice_search WHERE id = \?/, CUR_PATH_DEEP],
      [/peer\.node IN/, [{ notice_id: "A", wide_id: 11, deadline_ts: 1 }]],
      [/FROM crm_notice_search WHERE id IN/, [{ id: 11, p: "UGT-07020102" }]],
    ]);
    await findSimilarNoticeIds(pool, 1, 6);
    const candCalls = query.mock.calls.filter((c) => /peer\.node IN/.test(String(c[0])));
    expect(candCalls).toHaveLength(3);
    // 第一轮 L4 细节点；第二轮 L3；第三轮才带 L2（粗节点会灌满窗口，精细节点的 peer 一个都进不来）
    expect(candCalls[0]![1]).toEqual([1, "UGT-07020102"]);
    expect(candCalls[1]![1]).toEqual([1, "UGT-070201"]);
    expect(candCalls[2]![1]).toEqual([1, "UGT-0702"]);
    expect(String(candCalls[0]![0])).toContain("LIMIT 2000");
    expect(String(candCalls[1]![0])).toContain("LIMIT 1999");
  });

  it("候选 SQL 直认 UGT 节点（倒排表），不出现桥表/旧字典列的任何影子", async () => {
    const { pool, query } = makePool([
      ...ID_MAP,
      [/FROM crm_notice_search WHERE id = \?/, CUR_PATH],
      [/peer\.node IN/, []],
    ]);
    await findSimilarNoticeIds(pool, 1, 6);
    const peerSql = String(query.mock.calls.find((c) => /peer\.node IN/.test(String(c[0])))?.[0] || "");
    expect(peerSql).toContain("crm_notice_backbone_nodes");
    expect(peerSql).toContain("peer.node IN");
    expect(peerSql).not.toMatch(/crm_bid_notice_unspsc_codes/);
    expect(peerSql).not.toMatch(/level[1-5]_id/);
  });

  it("公告没进宽表 → 空数组且告警（同步缺位要叫出来，不能静默当无相似）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { pool, query } = makePool([
      ...ID_MAP,
      [/FROM crm_notice_search WHERE id = \?/, []],
    ]);
    expect(await findSimilarNoticeIds(pool, 42, 6)).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("42");
    expect(query.mock.calls.some((c) => /peer\.node IN/.test(String(c[0])))).toBe(false);
  });

  it("有行但列值为空（无码或未挂靠）→ 空数组且不告警", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { pool } = makePool([
      ...ID_MAP,
      [/FROM crm_notice_search WHERE id = \?/, [{ p: null }]],
    ]);
    expect(await findSimilarNoticeIds(pool, 1, 6)).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("节点全是大类 L1 → 空数组（L1 过宽不进候选检索）", async () => {
    const { pool, query } = makePool([
      ...ID_MAP,
      [/FROM crm_notice_search WHERE id = \?/, [{ p: "UGT-07" }]],
    ]);
    expect(await findSimilarNoticeIds(pool, 1, 6)).toEqual([]);
    expect(query.mock.calls.some((c) => /peer\.node IN/.test(String(c[0])))).toBe(false);
  });

  it("候选有行但宽表一个都查不到 → 空数组（不用空节点码硬凑分数）", async () => {
    const { pool } = makePool([
      ...ID_MAP,
      [/FROM crm_notice_search WHERE id = \?/, CUR_PATH],
      [/peer\.node IN/, [{ notice_id: "A", wide_id: 11, deadline_ts: 1 }]],
      [/FROM crm_notice_search WHERE id IN/, []],
    ]);
    expect(await findSimilarNoticeIds(pool, 1, 6)).toEqual([]);
  });
});

describe("findSimilarNotices", () => {
  it("当前公告无节点码 → 返回空数组，且不进入候选/水合查询（无兜底）", async () => {
    const { pool, query } = makePool([
      ...ID_MAP,
      [/FROM crm_notice_search WHERE id = \?/, [{ p: "" }]],
    ]);
    const res = await findSimilarNotices(pool, 1, 6, "zh");
    expect(res).toEqual([]);
    expect(query.mock.calls.length).toBeLessThanOrEqual(2); // 未进入候选/水合查询
  });

  it("有候选时水合并返回 NoticeListItem 形状（含 title_i18n/country/deadline_ts，不外泄内部列）", async () => {
    const { pool } = makePool([
      ...ID_MAP,
      [/FROM crm_notice_search WHERE id = \?/, CUR_PATH],
      [/peer\.node IN/, [{ notice_id: "A", wide_id: 11, deadline_ts: 1790000000 }]],
      [/FROM crm_notice_search WHERE id IN/, [{ id: 11, p: "UGT-07,UGT-0702" }]],
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

  // 线上事故回归：水合查询的列清单曾用两个自带尾逗号的片段拼在 FROM 前，
  // 不传 locale 也一样多出个尾逗号 → MySQL 1064，相似公告上线三周每次 500。
  // 当时所有单测全绿（mock 了 pool.query、不解析 SQL），所以这条断言必须打在拼好的 SQL 文本上。
  it("水合 SQL 不得出现「列清单尾逗号紧跟 FROM」（传与不传 locale 两种形状）", async () => {
    const hydrateSql = async (locale?: string) => {
      const { pool, query } = makePool([
        ...ID_MAP,
        [/FROM crm_notice_search WHERE id = \?/, CUR_PATH],
        [/peer\.node IN/, [{ notice_id: "A", wide_id: 11, deadline_ts: 1790000000 }]],
        [/FROM crm_notice_search WHERE id IN/, [{ id: 11, p: "UGT-07,UGT-0702" }]],
      ]);
      await findSimilarNotices(pool, 1, 6, locale);
      const call = query.mock.calls.find((c) => /FROM crm_bid_notices n[\s\S]*n\.notice_id IN/.test(String(c[0])));
      expect(call, `没发出水合查询（locale=${locale ?? "无"}）`).toBeDefined();
      return String(call![0]);
    };
    for (const locale of ["zh", undefined] as const) {
      const sql = await hydrateSql(locale);
      expect(sql).not.toMatch(/,\s*\n?\s*FROM/i);
      expect(sql).not.toMatch(/,\s*,/);            // 相邻两个逗号：空列位
      expect(sql).toMatch(/SELECT\s+[^,\s][\s\S]*\bFROM\b/i); // SELECT 后紧跟真实列，不是空白/逗号
    }
  });
});
