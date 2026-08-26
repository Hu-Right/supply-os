/**
 * server/services/search-orchestrator/mysql-fallback.ts 测试
 * 验证 MySQL FULLTEXT 降级搜索逻辑
 */
import { describe, it, expect, vi } from "vitest";
import { mysqlFallback } from "../../../../server/services/search-orchestrator/mysql-fallback";

// mock notice-expired
vi.mock("../../../../server/utils/notice-expired", () => ({
  ACTIVE_NOTICE_WHERE: "n.is_expired = 0",
  ACTIVE_NOTICE_WHERE_NO_ALIAS: "n2.is_expired = 0",
}));
vi.mock("../../../../server/utils/normalize", () => ({
  escapeLikeWildcard: (s: string) => s.replace(/[%_]/g, "\\$&"),
}));

describe("mysqlFallback", () => {
  it("无关键词 → 纯筛选模式", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ total: 5 }]])  // count
        .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }]]),  // ids
    };
    const result = await mysqlFallback(pool as any, {
      q: "", page: 1, pageSize: 20, sort: "deadline",
    } as any, {
      meiliFilters: [], mysqlWhere: ["n.country = ?"], mysqlParams: ["US"],
      conflictEmpty: false, digest: "",
    });
    expect(result.ids).toEqual([1, 2]);
    expect(result.total).toBe(5);
  });

  it("中文关键词 → FULLTEXT + 译文 LIKE 兜底", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[]]),
    };
    await mysqlFallback(pool as any, {
      q: "联合国", page: 1, pageSize: 20, sort: "latest",
    } as any, {
      meiliFilters: [], mysqlWhere: [], mysqlParams: [], conflictEmpty: false, digest: "",
    });
    const [countSql] = pool.query.mock.calls[0];
    expect(countSql).toContain("LIKE ?");
    expect(countSql).toContain("crm_notice_translations");
  });

  it("英文关键词 → 三路 FULLTEXT", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[]]),
    };
    await mysqlFallback(pool as any, {
      q: "procurement", page: 1, pageSize: 20, sort: "latest",
    } as any, {
      meiliFilters: [], mysqlWhere: [], mysqlParams: [], conflictEmpty: false, digest: "",
    });
    const [countSql] = pool.query.mock.calls[0];
    expect(countSql).toContain("MATCH");
    expect(countSql).toContain("BOOLEAN MODE");
  });

  it("异常 → 返回空结果（不抛出）", async () => {
    const pool = {
      query: vi.fn().mockRejectedValue(new Error("connection lost")),
    };
    const result = await mysqlFallback(pool as any, {
      q: "", page: 1, pageSize: 20, sort: "latest",
    } as any, {
      meiliFilters: [], mysqlWhere: [], mysqlParams: [], conflictEmpty: false, digest: "",
    });
    expect(result.ids).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("sort=deadline → ORDER BY 包含 deadline_sec ASC", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[{ id: 10 }]]),
    };
    await mysqlFallback(pool as any, {
      q: "", page: 1, pageSize: 20, sort: "deadline",
    } as any, {
      meiliFilters: [], mysqlWhere: [], mysqlParams: [], conflictEmpty: false, digest: "",
    });
    const [, idParams] = pool.query.mock.calls[1];
    const idSql = pool.query.mock.calls[1][0];
    expect(idSql).toContain("deadline_sec ASC");
  });
});
