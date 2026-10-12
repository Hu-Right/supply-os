/**
 * findSimilarNotices：验证「无行/无码/无候选 → 空数组」短路 + 码深度分档优先 + 三段查询串联。
 * 排序正确性已在 similar-scoring.test.ts 覆盖，此处只测编排、短路和检索口径。
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

// 当前公告：链顶 UGT-B-07 + 中类 UGT-B-0702（列值祖先全存）
const CUR_PATH = [{ p: "UGT-B-07,UGT-B-0702" }];
// 当前公告身上的码：一个品目级细码 + 一个族级粗码
const CUR_CODES = [{ code: "43211503" }, { code: "10100000" }];

const ID_MAP: Array<[RegExp, unknown[]]> = [
  [/FROM crm_bid_notices n WHERE n\.id/, [{ notice_id: "CUR" }]],
];

describe("findSimilarNoticeIds", () => {
  afterEach(() => vi.restoreAllMocks());

  it("按分数降序返回 peer notice_id", async () => {
    const { pool } = makePool([
      ...ID_MAP,
      [/FROM crm_notice_search WHERE id = \?/, CUR_PATH],
      [/FROM crm_bid_notice_unspsc_codes WHERE notice_id = \?/, CUR_CODES],
      [/peer\.code IN/, [
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

  it("检索按码深度分档：细码那一档先问，粗码那一档后问，且后一轮窗口按已收集数收窄", async () => {
    const { pool, query } = makePool([
      ...ID_MAP,
      [/FROM crm_notice_search WHERE id = \?/, CUR_PATH],
      [/FROM crm_bid_notice_unspsc_codes WHERE notice_id = \?/, CUR_CODES],
      [/peer\.code IN/, [{ notice_id: "A", wide_id: 11, deadline_ts: 1 }]],
      [/FROM crm_notice_search WHERE id IN/, [{ id: 11, p: "UGT-B-0702" }]],
    ]);
    await findSimilarNoticeIds(pool, 1, 6);
    const candCalls = query.mock.calls.filter((c) => /peer\.code IN/.test(String(c[0])));
    expect(candCalls).toHaveLength(2);
    // 第一轮只带品目级细码；第二轮才带族级粗码（实测单码 >2000 行的粗码有 33 个，
    // 不分档就会让粗码把窗口灌满，精细码的 peer 一个都进不来）
    expect(candCalls[0]![1]).toEqual(["CUR", "43211503"]);
    expect(candCalls[1]![1]).toEqual(["CUR", "10100000"]);
    expect(String(candCalls[0]![0])).toContain("LIMIT 2000");
    expect(String(candCalls[1]![0])).toContain("LIMIT 1999");
  });

  it("候选 SQL 不再读旧字典五列、不再按桥表 level 选分支（D-6）", async () => {
    const { pool, query } = makePool([
      ...ID_MAP,
      [/FROM crm_notice_search WHERE id = \?/, CUR_PATH],
      [/FROM crm_bid_notice_unspsc_codes WHERE notice_id = \?/, CUR_CODES],
      [/peer\.code IN/, []],
    ]);
    await findSimilarNoticeIds(pool, 1, 6);
    const peerSql = String(query.mock.calls.find((c) => /peer\.code IN/.test(String(c[0])))?.[0] || "");
    expect(peerSql).toContain("peer.code IN");
    expect(peerSql).not.toMatch(/level[1-5]_id/);
    expect(peerSql).not.toContain("cur.level");
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
    expect(query.mock.calls.some((c) => /peer\.code IN/.test(String(c[0])))).toBe(false);
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

  it("身上的码全是换不出有效位的野码 → 空数组（不进候选检索，交门禁点名）", async () => {
    const { pool, query } = makePool([
      ...ID_MAP,
      [/FROM crm_notice_search WHERE id = \?/, CUR_PATH],
      [/FROM crm_bid_notice_unspsc_codes WHERE notice_id = \?/, [{ code: "ABCDEFGH" }, { code: "00000000" }]],
    ]);
    expect(await findSimilarNoticeIds(pool, 1, 6)).toEqual([]);
    expect(query.mock.calls.some((c) => /peer\.code IN/.test(String(c[0])))).toBe(false);
  });

  it("候选有行但宽表一个都查不到 → 空数组（不用空节点码硬凑分数）", async () => {
    const { pool } = makePool([
      ...ID_MAP,
      [/FROM crm_notice_search WHERE id = \?/, CUR_PATH],
      [/FROM crm_bid_notice_unspsc_codes WHERE notice_id = \?/, CUR_CODES],
      [/peer\.code IN/, [{ notice_id: "A", wide_id: 11, deadline_ts: 1 }]],
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
      [/FROM crm_bid_notice_unspsc_codes WHERE notice_id = \?/, CUR_CODES],
      [/peer\.code IN/, [{ notice_id: "A", wide_id: 11, deadline_ts: 1790000000 }]],
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

  // 线上事故回归：水合查询的列清单曾用两个自带尾逗号的片段拼在 FROM 前，
  // 不传 locale 也一样多出个尾逗号 → MySQL 1064，相似公告上线三周每次 500。
  // 当时所有单测全绿（mock 了 pool.query、不解析 SQL），所以这条断言必须打在拼好的 SQL 文本上。
  it("水合 SQL 不得出现「列清单尾逗号紧跟 FROM」（传与不传 locale 两种形状）", async () => {
    const hydrateSql = async (locale?: string) => {
      const { pool, query } = makePool([
        ...ID_MAP,
        [/FROM crm_notice_search WHERE id = \?/, CUR_PATH],
        [/FROM crm_bid_notice_unspsc_codes WHERE notice_id = \?/, CUR_CODES],
        [/peer\.code IN/, [{ notice_id: "A", wide_id: 11, deadline_ts: 1790000000 }]],
        [/FROM crm_notice_search WHERE id IN/, [{ id: 11, p: "UGT-B-07,UGT-B-0702" }]],
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
