import { describe, it, expect, vi } from "vitest";
import { statsKeyFor, getStatsCount, refreshNoticeStats, getNoticeStats, clearStatsCache } from "@/lib/services/notice-search/stats";
import type { NoticeSearchParams } from "@/lib/services/notice-search/types";

const base: NoticeSearchParams = {
  page: 1, pageSize: 9, q: "", country: "", agency: "",
  deadlineFrom: "", deadlineTo: "", sort: "deadline_farthest",
  deadlineWithinDays: 0, noticeType: "", featuredOnly: false,
};

describe("statsKeyFor", () => {
  it("无筛选 → active_total", () => {
    expect(statsKeyFor(base)).toContain("active_total");
  });

  it("有 q → null（走 COUNT 查询）", () => {
    expect(statsKeyFor({ ...base, q: "test" })).toBeNull();
  });

  it("有 country → country:key", () => {
    expect(statsKeyFor({ ...base, country: "China" })).toContain("country:China");
  });

  it("有 agency → agency:key", () => {
    expect(statsKeyFor({ ...base, agency: "UNDP" })).toContain("agency:UNDP");
  });

  it("country + agency → null", () => {
    expect(statsKeyFor({ ...base, country: "China", agency: "UNDP" })).toBeNull();
  });

  it("featuredOnly → featured key", () => {
    expect(statsKeyFor({ ...base, featuredOnly: true })).toContain("featured");
  });

  it("有 deadlineFrom → null", () => {
    expect(statsKeyFor({ ...base, deadlineFrom: "2026-01-01" })).toBeNull();
  });

  it("有 noticeType → null", () => {
    expect(statsKeyFor({ ...base, noticeType: "ITB" })).toBeNull();
  });

  it("有 codeId → null", () => {
    expect(statsKeyFor({ ...base, codeId: 42 })).toBeNull();
  });

  it("聚合机构名（_BR 后缀）→ null", () => {
    expect(statsKeyFor({ ...base, agency: "MUNICIPIO_BR" })).toBeNull();
  });

  it("聚合机构名（FORCE_COUNTRY_）→ null", () => {
    expect(statsKeyFor({ ...base, agency: "FORCE_COUNTRY_XYZ" })).toBeNull();
  });
});

describe("getStatsCount", () => {
  it("DB 返回有效数据 → 返回数字", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue([[{ stat_value: 100 }]]),
    };
    const result = await getStatsCount(mockPool as any, "test_key");
    expect(result).toBe(100);
  });

  it("DB 返回空 → null", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue([[]]),
    };
    const result = await getStatsCount(mockPool as any, "missing_key");
    expect(result).toBeNull();
  });

  it("DB 异常 → null", async () => {
    const mockPool = {
      query: vi.fn().mockRejectedValue(new Error("DB error")),
    };
    const result = await getStatsCount(mockPool as any, "err_key");
    expect(result).toBeNull();
  });
});

describe("refreshNoticeStats", () => {
  it("调用 DB 查询并执行刷新", async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ cnt: 100 }]])  // active total
        .mockResolvedValueOnce([[{ cnt: 10 }]])    // featured
        .mockResolvedValueOnce([[]])               // countries
        .mockResolvedValueOnce([[]])               // agencies
        .mockResolvedValueOnce([[]])               // INSERT entries
        .mockResolvedValueOnce([[{ affectedRows: 0 }]]), // cleanup
    };
    await refreshNoticeStats(mockPool as any);
    expect(mockPool.query).toHaveBeenCalled();
  });
});

describe("getNoticeStats", () => {
  it("返回统计数据", async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ total: 200 }]])  // raw
        .mockResolvedValueOnce([[{ total: 100 }]])  // active
        .mockResolvedValueOnce([[{ total: 50 }]])   // bridged
        .mockResolvedValueOnce([[{ total: 10 }]]),  // featured
    };
    const result = await getNoticeStats(mockPool as any);
    expect(result.raw).toBe(200);
    expect(result.active).toBe(100);
    expect(result.bridged).toBe(50);
    expect(result.featured).toBe(10);
    expect(result.bridge_gap).toBe(50);
  });
});

describe("statsKeyFor — featuredOnly 组合分支", () => {
  it("featuredOnly + country → null（组合筛选走 COUNT）", () => {
    expect(statsKeyFor({ ...base, featuredOnly: true, country: "Brazil" })).toBeNull();
  });

  it("featuredOnly + agency → null", () => {
    expect(statsKeyFor({ ...base, featuredOnly: true, agency: "UNICEF" })).toBeNull();
  });
});

describe("refreshNoticeStats", () => {
  function makePool() {
    const insertCalls: string[] = [];
    return {
      insertCalls,
      pool: {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("INSERT INTO crm_notice_stats")) {
            insertCalls.push(sql);
            return [{ affectedRows: 1 }];
          }
          if (sql.includes("DELETE FROM crm_notice_stats")) return [{ affectedRows: 3 }];
          if (sql.includes("GROUP BY country")) return [[{ country: "Brazil", cnt: 50 }, { country: "Kenya", cnt: 30 }]];
          if (sql.includes("GROUP BY agency")) return [[{ agency: "UNICEF", cnt: 40 }]];
          if (sql.includes("is_featured = 1")) return [[{ cnt: 10 }]];
          return [[{ cnt: 100 }]];
        }),
      } as any,
    };
  }

  it("刷新成功 → 写入全部统计项并预填缓存，无异常", async () => {
    const { pool, insertCalls } = makePool();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await refreshNoticeStats(pool);
    // 2 条固定统计 + 2 国 + 1 机构 = 5 条 upsert
    expect(insertCalls).toHaveLength(5);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("统计表刷新完成"));
    logSpy.mockRestore();
    clearStatsCache();
  });

  it("查询异常 → 静默降级不抛出", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const badPool = { query: vi.fn().mockRejectedValue(new Error("db down")) } as any;
    await expect(refreshNoticeStats(badPool)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("统计表刷新失败"), expect.anything());
    errorSpy.mockRestore();
  });
});
