/**
 * server/services/unspsc — filter + interest 测试
 */
import { describe, it, expect, vi } from "vitest";

// ── filter.ts ─────────────────────────────────────────────────────────────────
import { buildNoticeUnspscFilter, getUnspscPath } from "../../../../server/services/unspsc/filter";

describe("buildNoticeUnspscFilter", () => {
  it("codeId=0 返回空 SQL", async () => {
    const pool = { query: vi.fn() };
    const result = await buildNoticeUnspscFilter(pool, 0);
    expect(result.sql).toBe("");
    expect(result.params).toEqual([]);
  });

  it("codeId 对应码不存在 → 返回空结果 JOIN", async () => {
    const pool = { query: vi.fn().mockResolvedValue([[]]) };
    const result = await buildNoticeUnspscFilter(pool, 999);
    expect(result.sql).toContain("NULL");
  });

  it("level 1~5 码 → 生成对应 levelN_id JOIN", async () => {
    for (let level = 1; level <= 5; level++) {
      const pool = { query: vi.fn().mockResolvedValue([[{ id: 42, code: "12345678", level }]]) };
      const result = await buildNoticeUnspscFilter(pool, 42);
      expect(result.sql).toContain(`level${level}_id`);
      expect(result.params).toEqual(["42"]);
    }
  });

  it("level 6+ 深层节点 → 使用 code_id 兜底", async () => {
    const pool = { query: vi.fn().mockResolvedValue([[{ id: 99, code: "12345678", level: 6 }]]) };
    const result = await buildNoticeUnspscFilter(pool, 99);
    expect(result.sql).toContain("code_id");
    expect(result.params).toEqual([99]);
  });
});

describe("getUnspscPath", () => {
  it("codeId 不存在 → 返回全 null path", async () => {
    const pool = { query: vi.fn().mockResolvedValue([[]]) };
    const result = await getUnspscPath(pool, 999);
    expect(result.level1_id).toBeNull();
    expect(result.level5_id).toBeNull();
  });

  it("逐级回溯构建 path", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ id: 10, parent_id: 9, level: 3 }]])
        .mockResolvedValueOnce([[{ id: 9, parent_id: 8, level: 2 }]])
        .mockResolvedValueOnce([[{ id: 8, parent_id: null, level: 1 }]])
        .mockResolvedValueOnce([[]]),
    };
    const result = await getUnspscPath(pool, 10);
    expect(result.level3_id).toBe(10);
    expect(result.level2_id).toBe(9);
    expect(result.level1_id).toBe(8);
  });

  it("level 6+ 不写入 path（仅 1-5）", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ id: 100, parent_id: 10, level: 6 }]])
        .mockResolvedValueOnce([[{ id: 10, parent_id: null, level: 1 }]])
        .mockResolvedValueOnce([[]]),
    };
    const result = await getUnspscPath(pool, 100);
    // level 6 不写入任何 levelN_id
    expect(result.level1_id).toBe(10);
  });
});

// ── interest.ts ───────────────────────────────────────────────────────────────
import { persistUserInterestCodes } from "../../../../server/services/unspsc/interest";

describe("persistUserInterestCodes", () => {
  it("白名单外来源直接返回不写入", async () => {
    const pool = { query: vi.fn(), execute: vi.fn() };
    await persistUserInterestCodes(pool, "u@t.com", [{ code: "12345678" }], "unknown_source", 1.0);
    expect(pool.query).not.toHaveBeenCalled();
    expect(pool.execute).not.toHaveBeenCalled();
  });

  it("白名单内来源执行写入", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue([[{ id: 1, level: 2 }]]),
      execute: vi.fn().mockResolvedValue([{}]),
    };
    await persistUserInterestCodes(pool, "u@t.com", [{ code: "12345678" }], "unlock_order", 2.5);
    // 至少执行了 query（查码）和 execute（写入）
    expect(pool.query).toHaveBeenCalled();
    expect(pool.execute).toHaveBeenCalled();
  });

  it("空 snapshot 不写入", async () => {
    const pool = { query: vi.fn(), execute: vi.fn() };
    await persistUserInterestCodes(pool, "u@t.com", [], "feedback_click", 0.3);
    // 无码 → 无 prefixes → 不执行 query
    expect(pool.query).not.toHaveBeenCalled();
  });
});
