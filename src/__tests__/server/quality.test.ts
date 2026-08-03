// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncUnspscBridge, captureDataQualitySnapshot } from "../../../server/services/quality";
import { getUnspscPath } from "../../../server/services/unspsc";

// 保留真实 normalizeUnspscCodes，仅替换沿 parent_id 回溯的 getUnspscPath
vi.mock("../../../server/services/unspsc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../server/services/unspsc")>();
  return { ...actual, getUnspscPath: vi.fn() };
});

const mockedGetUnspscPath = vi.mocked(getUnspscPath);

const emptyPath = {
  level1_id: null,
  level2_id: null,
  level3_id: null,
  level4_id: null,
  level5_id: null,
};

describe("syncUnspscBridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUnspscPath.mockResolvedValue({ ...emptyPath, level1_id: 1, level2_id: 55 });
  });

  const makePool = (sourceRows: any[], codeLookup: Record<string, any[]> = {}) => ({
    query: vi.fn(async (sql: string, params?: any[]) => {
      if (String(sql).includes("unspsc_codes IS NOT NULL")) return [sourceRows];
      if (String(sql).includes("FROM crm_unspsc_codes WHERE code")) {
        return [codeLookup[String(params?.[0])] ?? []];
      }
      return [[]];
    }),
    execute: vi.fn().mockResolvedValue([]),
  });

  it("writes notice bridge rows keyed by external notice_id", async () => {
    const pool = makePool(
      [{ id: 7, notice_id: "EXT-1", unspsc_codes: '["23000000"]' }],
      { "23000000": [{ id: 55, code: "23000000", level: 2 }] }
    );

    await syncUnspscBridge(pool, "notice");

    // 源扫描命中公告主表
    expect(pool.query.mock.calls[0][0]).toContain("FROM crm_bid_notices");
    expect(mockedGetUnspscPath).toHaveBeenCalledWith(pool, 55);
    const [sql, params] = pool.execute.mock.calls[0];
    expect(sql).toContain("INSERT IGNORE INTO crm_bid_notice_unspsc_codes");
    expect(sql).toContain("notice_id, code_id");
    expect(params).toEqual(["EXT-1", 55, "23000000", 2, 1, 55, null, null, null]);
  });

  it("falls back to row.id when external notice_id is missing", async () => {
    const pool = makePool(
      [{ id: 9, notice_id: null, unspsc_codes: '["40000000"]' }],
      { "40000000": [{ id: 77, code: "40000000", level: 1 }] }
    );

    await syncUnspscBridge(pool, "notice");
    expect(pool.execute.mock.calls[0][1][0]).toBe(9);
  });

  it("targets opportunity tables and fk for opportunity source", async () => {
    const pool = makePool(
      [{ id: 3, notice_id: "OPP-1", unspsc_codes: '["23000000"]' }],
      { "23000000": [{ id: 55, code: "23000000", level: 2 }] }
    );

    await syncUnspscBridge(pool, "opportunity");

    expect(pool.query.mock.calls[0][0]).toContain("FROM crm_bid_opportunities");
    const [sql, params] = pool.execute.mock.calls[0];
    expect(sql).toContain("crm_bid_opportunity_unspsc_codes");
    expect(sql).toContain("opportunity_id, code_id");
    expect(params[0]).toBe("OPP-1");
  });

  it("skips codes missing from the category tree (no dirty rows)", async () => {
    const pool = makePool([{ id: 7, notice_id: "EXT-1", unspsc_codes: '["99999999"]' }]);
    await syncUnspscBridge(pool, "notice");
    expect(pool.execute).not.toHaveBeenCalled();
    expect(mockedGetUnspscPath).not.toHaveBeenCalled();
  });

  it("ignores entries without digits", async () => {
    const pool = makePool([{ id: 7, notice_id: "EXT-1", unspsc_codes: '["abc"]' }]);
    await syncUnspscBridge(pool, "notice");
    expect(pool.execute).not.toHaveBeenCalled();
  });
});

describe("captureDataQualitySnapshot", () => {
  it("aggregates three queries and upserts the snapshot", async () => {
    const pool = {
      query: vi.fn(async (sql: string) => {
        if (String(sql).includes("SUM(n.estimated_value")) {
          return [[{
            total_notices: "100", missing_value: "5", missing_country: "2",
            missing_deadline: "3", expired_but_active: "4",
          }]];
        }
        if (String(sql).includes("unlinked_unspsc")) return [[{ unlinked_unspsc: "9" }]];
        if (String(sql).includes("dup_notice_cnt")) return [[{ dup_notice_cnt: "6" }]];
        return [[]];
      }),
      execute: vi.fn().mockResolvedValue([]),
    };

    const metrics = await captureDataQualitySnapshot(pool);
    expect(metrics).toEqual({
      total_notices: 100,
      missing_value: 5,
      missing_country: 2,
      missing_deadline: 3,
      unlinked_unspsc: 9,
      expired_but_active: 4,
      dup_notice_cnt: 6,
    });

    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(pool.execute).toHaveBeenCalledTimes(1);
    const [upsertSql, upsertParams] = pool.execute.mock.calls[0];
    expect(upsertSql).toContain("crm_data_quality_snapshot");
    expect(upsertSql).toContain("ON DUPLICATE KEY UPDATE");
    expect(upsertParams).toEqual([100, 5, 2, 3, 9, 4, 6]);
  });

  it("treats missing aggregates as zero", async () => {
    const pool = {
      query: vi.fn(async (sql: string) => {
        if (String(sql).includes("SUM(n.estimated_value")) return [[{}]];
        return [[]];
      }),
      execute: vi.fn().mockResolvedValue([]),
    };

    const metrics = await captureDataQualitySnapshot(pool);
    expect(metrics).toEqual({
      total_notices: 0,
      missing_value: 0,
      missing_country: 0,
      missing_deadline: 0,
      unlinked_unspsc: 0,
      expired_but_active: 0,
      dup_notice_cnt: 0,
    });
  });
});
