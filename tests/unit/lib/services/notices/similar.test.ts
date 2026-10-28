/**
 * findSimilarNoticeIds：验证「无行/无码/无候选 → 空数组」短路 + 节点深度分档优先 + 三段查询串联 + 返回有序 notice_pk。
 * findSimilarNotices：验证编排改为复用主列表同一条尾 fetchDetailsByIds + formatItems（mock 之）。
 * 排序正确性已在 similar-scoring.test.ts 覆盖，此处只测编排、短路和检索口径。
 * 小表剥离（2026-10-14）：候选检索走倒排表 UGT 节点（peer.node IN）。
 * 并轨服务表投影（2026-10-27）：相似项水合不再手写基表 SQL，改走 SSOT 尾，返回宽表名字段。
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import type { Pool } from "mysql2/promise";

// 复用主列表的 SSOT 水合尾：本测试以 mock 断言编排，不重跑其内部 SQL（其正确性由 detail-fetch/format 自身测试覆盖）
vi.mock("@/lib/services/search-orchestrator/detail-fetch", () => ({ fetchDetailsByIds: vi.fn() }));
vi.mock("@/lib/services/search-orchestrator/format", () => ({ formatItems: vi.fn() }));

import { findSimilarNotices, findSimilarNoticeIds } from "@/lib/services/notices/similar";
import { fetchDetailsByIds } from "@/lib/services/search-orchestrator/detail-fetch";
import { formatItems } from "@/lib/services/search-orchestrator/format";

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
  [/FROM bid_notices n WHERE n\.id/, [{ notice_id: "CUR" }]],
];

describe("findSimilarNoticeIds", () => {
  afterEach(() => vi.restoreAllMocks());

  it("按分数降序返回 peer 的有序 notice_pk（wide_id）", async () => {
    const { pool } = makePool([
      ...ID_MAP,
      [/FROM notice_search WHERE id = \?/, CUR_PATH],
      [/peer\.node IN/, [
        { notice_id: "A", wide_id: 11, deadline_ts: 100 },
        { notice_id: "B", wide_id: 12, deadline_ts: 100 },
      ]],
      [/FROM notice_search WHERE id IN/, [
        { id: 11, p: "UGT-07,UGT-0702" },
        { id: 12, p: "UGT-07" },
      ]],
    ]);
    // 两侧都只取叶子做代表：A 共享到中类（0.6），B 只共享到大类（0.4）→ 顺序 A(11) 先于 B(12)
    expect(await findSimilarNoticeIds(pool, 1, 6)).toEqual([11, 12]);
  });

  it("检索按节点深度分档：L4 先问、L3 次之、L2 最后，且后一轮窗口按已收集数收窄", async () => {
    const { pool, query } = makePool([
      ...ID_MAP,
      [/FROM notice_search WHERE id = \?/, CUR_PATH_DEEP],
      [/peer\.node IN/, [{ notice_id: "A", wide_id: 11, deadline_ts: 1 }]],
      [/FROM notice_search WHERE id IN/, [{ id: 11, p: "UGT-07020102" }]],
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
      [/FROM notice_search WHERE id = \?/, CUR_PATH],
      [/peer\.node IN/, []],
    ]);
    await findSimilarNoticeIds(pool, 1, 6);
    const peerSql = String(query.mock.calls.find((c) => /peer\.node IN/.test(String(c[0])))?.[0] || "");
    expect(peerSql).toContain("notice_backbone_nodes");
    expect(peerSql).toContain("peer.node IN");
    expect(peerSql).not.toMatch(/crm_bid_notice_\w*_codes\b/);
    expect(peerSql).not.toMatch(/level[1-5]_id/);
  });

  it("公告没进宽表 → 空数组且告警（同步缺位要叫出来，不能静默当无相似）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { pool, query } = makePool([
      ...ID_MAP,
      [/FROM notice_search WHERE id = \?/, []],
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
      [/FROM notice_search WHERE id = \?/, [{ p: null }]],
    ]);
    expect(await findSimilarNoticeIds(pool, 1, 6)).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("节点全是大类 L1 → 空数组（L1 过宽不进候选检索）", async () => {
    const { pool, query } = makePool([
      ...ID_MAP,
      [/FROM notice_search WHERE id = \?/, [{ p: "UGT-07" }]],
    ]);
    expect(await findSimilarNoticeIds(pool, 1, 6)).toEqual([]);
    expect(query.mock.calls.some((c) => /peer\.node IN/.test(String(c[0])))).toBe(false);
  });

  it("候选有行但宽表一个都查不到 → 空数组（不用空节点码硬凑分数）", async () => {
    const { pool } = makePool([
      ...ID_MAP,
      [/FROM notice_search WHERE id = \?/, CUR_PATH],
      [/peer\.node IN/, [{ notice_id: "A", wide_id: 11, deadline_ts: 1 }]],
      [/FROM notice_search WHERE id IN/, []],
    ]);
    expect(await findSimilarNoticeIds(pool, 1, 6)).toEqual([]);
  });
});

describe("findSimilarNotices（并轨：复用 fetchDetailsByIds + formatItems）", () => {
  const fetchMock = fetchDetailsByIds as ReturnType<typeof vi.fn>;
  const formatMock = formatItems as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("当前公告无节点码 → 返回空数组，且不进入候选/水合查询（无兜底）", async () => {
    const { pool, query } = makePool([
      ...ID_MAP,
      [/FROM notice_search WHERE id = \?/, [{ p: "" }]],
    ]);
    const res = await findSimilarNotices(pool, 1, 6, "zh");
    expect(res).toEqual([]);
    expect(query.mock.calls.length).toBeLessThanOrEqual(2); // 未进入候选/水合查询
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("有候选：以有序 notice_pk 调 fetchDetailsByIds，再交 formatItems 产出宽表项", async () => {
    const { pool } = makePool([
      ...ID_MAP,
      [/FROM notice_search WHERE id = \?/, CUR_PATH],
      [/peer\.node IN/, [
        { notice_id: "A", wide_id: 11, deadline_ts: 1790000000 },
        { notice_id: "B", wide_id: 12, deadline_ts: 1790000000 },
      ]],
      [/FROM notice_search WHERE id IN/, [
        { id: 11, p: "UGT-07,UGT-0702" },
        { id: 12, p: "UGT-07" },
      ]],
    ]);
    const details = [{ notice_pk: 11 }, { notice_pk: 12 }];
    const formatted = [
      { notice_pk: 11, country_code: "KE", notice_type_code: "Supply", buyer_name: "AG", deadline_ts: 1790000000 },
      { notice_pk: 12, country_code: "US", notice_type_code: "Tender", buyer_name: "X", deadline_ts: 1790000000 },
    ];
    fetchMock.mockResolvedValue(details);
    formatMock.mockReturnValue(formatted);

    const res = await findSimilarNotices(pool, 1, 6, "zh");

    // 有序 notice_pk（相似排序保留），交给服务表水合
    expect(fetchMock).toHaveBeenCalledWith(expect.anything(), [11, 12], "zh");
    expect(formatMock).toHaveBeenCalledWith(details, "zh");
    expect(res).toEqual(formatted);
    // 并轨后不再吐基表历史列名
    for (const stale of ["country", "notice_type", "agency", "deadline", "id"]) {
      expect(res[0]).not.toHaveProperty(stale);
    }
  });
});
