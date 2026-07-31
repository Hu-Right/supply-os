// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  normalizeUnspscCodes,
  unspscPrefixFromCode,
  expandUnspscInterestPrefixes,
  padUnspscPrefix,
  buildNoticeUnspscFilter,
  persistUserInterestCodes,
  getUnspscPath,
} from "../../../server/services/unspsc";

// ─── normalizeUnspscCodes ───────────────────────────────────────────────────
describe("normalizeUnspscCodes", () => {
  it("extracts codes from array of objects", () => {
    const result = normalizeUnspscCodes([
      { code: "80101500", name: "Building" },
      { code: "72101500", name: "Construction" },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ code: "80101500", name: "Building" });
  });

  it("extracts codes from JSON string", () => {
    const json = JSON.stringify([{ code: "8010", name: "Mgmt" }]);
    const result = normalizeUnspscCodes(json);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("8010");
  });

  it("extracts multiple codes from single code field", () => {
    const result = normalizeUnspscCodes([{ code: "8010 7210", name: "Multi" }]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.code)).toContain("8010");
    expect(result.map((r) => r.code)).toContain("7210");
  });

  it("deduplicates codes", () => {
    const result = normalizeUnspscCodes([
      { code: "8010", name: "A" },
      { code: "8010", name: "B" },
    ]);
    expect(result).toHaveLength(1);
  });

  it("limits to 20 codes max", () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      code: String(1000 + i * 2),
      name: `Code ${i}`,
    }));
    const result = normalizeUnspscCodes(items);
    expect(result.length).toBeLessThanOrEqual(20);
  });

  it("returns empty for null/undefined/invalid", () => {
    expect(normalizeUnspscCodes(null)).toEqual([]);
    expect(normalizeUnspscCodes(undefined)).toEqual([]);
    expect(normalizeUnspscCodes("invalid")).toEqual([]);
  });

  it("handles plain string with codes", () => {
    const result = normalizeUnspscCodes("80101500");
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("80101500");
  });
});

// ─── unspscPrefixFromCode ───────────────────────────────────────────────────
describe("unspscPrefixFromCode", () => {
  it("strips trailing 00 pairs to find significant prefix", () => {
    expect(unspscPrefixFromCode("80101500")).toBe("801015");
    expect(unspscPrefixFromCode("80100000")).toBe("8010");
    expect(unspscPrefixFromCode("80000000")).toBe("80");
  });

  it("returns full code when no trailing zeros", () => {
    expect(unspscPrefixFromCode("80101501")).toBe("80101501");
  });

  it("handles non-digit characters", () => {
    expect(unspscPrefixFromCode("AB-8010-CD")).toBe("8010");
  });

  it("returns empty for empty/null input", () => {
    expect(unspscPrefixFromCode("")).toBe("");
    expect(unspscPrefixFromCode(null as any)).toBe("");
  });

  it("slices to max 8 digits", () => {
    expect(unspscPrefixFromCode("1234567890")).toBe("12345678");
  });
});

// ─── expandUnspscInterestPrefixes ───────────────────────────────────────────
describe("expandUnspscInterestPrefixes", () => {
  it("expands code into hierarchical prefixes", () => {
    const result = expandUnspscInterestPrefixes("80101500");
    expect(result).toContain("80");
    expect(result).toContain("8010");
    expect(result).toContain("801015");
    expect(result).toHaveLength(3);
  });

  it("returns empty for empty code", () => {
    expect(expandUnspscInterestPrefixes("")).toEqual([]);
  });

  it("handles 2-digit code", () => {
    const result = expandUnspscInterestPrefixes("80");
    expect(result).toEqual(["80"]);
  });

  it("deduplicates prefixes", () => {
    const result = expandUnspscInterestPrefixes("80808080");
    const unique = new Set(result);
    expect(result.length).toBe(unique.size);
  });
});

// ─── padUnspscPrefix ────────────────────────────────────────────────────────
describe("padUnspscPrefix", () => {
  it("pads prefix to 8 chars with zeros", () => {
    expect(padUnspscPrefix("80")).toBe("80000000");
    expect(padUnspscPrefix("8010")).toBe("80100000");
    expect(padUnspscPrefix("801015")).toBe("80101500");
  });

  it("truncates to 8 chars if longer", () => {
    expect(padUnspscPrefix("8010150012")).toBe("80101500");
  });

  it("handles empty/null", () => {
    expect(padUnspscPrefix("")).toBe("00000000");
    expect(padUnspscPrefix(null as any)).toBe("00000000");
  });
});

// ─── buildNoticeUnspscFilter ────────────────────────────────────────────────
describe("buildNoticeUnspscFilter", () => {
  it("returns empty filter for codeId=0", async () => {
    const dbPool = { query: vi.fn() };
    const result = await buildNoticeUnspscFilter(dbPool, 0);
    expect(result).toEqual({ sql: "", params: [] });
    expect(dbPool.query).not.toHaveBeenCalled();
  });

  it("returns empty filter when code not found", async () => {
    const dbPool = { query: vi.fn().mockResolvedValue([[]]) };
    const result = await buildNoticeUnspscFilter(dbPool, 999);
    expect(result).toEqual({ sql: "", params: [] });
  });

  it("builds level-based filter for level 1-5", async () => {
    const dbPool = {
      query: vi.fn().mockResolvedValue([[{ id: 42, code: "8010", level: 2 }]]),
    };
    const result = await buildNoticeUnspscFilter(dbPool, 42);
    expect(result.sql).toContain("level2_id = ?");
    expect(result.params).toEqual(["42"]);
  });

  it("uses code_id fallback for level > 5", async () => {
    const dbPool = {
      query: vi.fn().mockResolvedValue([[{ id: 99, code: "8010150100", level: 6 }]]),
    };
    const result = await buildNoticeUnspscFilter(dbPool, 99);
    expect(result.sql).toContain("code_id = ?");
    expect(result.params).toEqual([99]);
  });
});

// ─── persistUserInterestCodes ───────────────────────────────────────────────
describe("persistUserInterestCodes", () => {
  it("rejects non-whitelisted source", async () => {
    const dbPool = { query: vi.fn(), execute: vi.fn() };
    await persistUserInterestCodes(dbPool, "user1", [{ code: "8010" }], "invalid_source", 1.0);
    expect(dbPool.query).not.toHaveBeenCalled();
    expect(dbPool.execute).not.toHaveBeenCalled();
  });

  it("persists codes for whitelisted source", async () => {
    const dbPool = {
      query: vi.fn().mockResolvedValue([[{ id: 1, level: 2 }]]),
      execute: vi.fn().mockResolvedValue([]),
    };
    await persistUserInterestCodes(dbPool, "user1", [{ code: "80101500" }], "unlock_order", 2.5);
    expect(dbPool.execute).toHaveBeenCalled();
    const [sql] = dbPool.execute.mock.calls[0];
    expect(sql).toContain("INSERT INTO crm_user_interest_codes");
    expect(sql).toContain("ON DUPLICATE KEY UPDATE");
  });

  it("expands prefixes and persists each", async () => {
    const dbPool = {
      query: vi.fn().mockResolvedValue([[{ id: 1, level: 1 }]]),
      execute: vi.fn().mockResolvedValue([]),
    };
    await persistUserInterestCodes(dbPool, "user1", [{ code: "80101500" }], "feedback_click", 0.3);
    // expandUnspscInterestPrefixes("80101500") → ["80", "8010", "801015"]
    expect(dbPool.execute).toHaveBeenCalledTimes(3);
  });
});

// ─── getUnspscPath ──────────────────────────────────────────────────────────
describe("getUnspscPath", () => {
  it("builds path by traversing parent chain", async () => {
    const dbPool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ id: 5, parent_id: 3, level: 3 }]])
        .mockResolvedValueOnce([[{ id: 3, parent_id: 1, level: 2 }]])
        .mockResolvedValueOnce([[{ id: 1, parent_id: null, level: 1 }]]),
    };
    const path = await getUnspscPath(dbPool, 5);
    expect(path.level3_id).toBe(5);
    expect(path.level2_id).toBe(3);
    expect(path.level1_id).toBe(1);
    expect(path.level4_id).toBeNull();
    expect(path.level5_id).toBeNull();
  });

  it("returns all nulls when code not found", async () => {
    const dbPool = { query: vi.fn().mockResolvedValue([[]]) };
    const path = await getUnspscPath(dbPool, 999);
    expect(path).toEqual({
      level1_id: null,
      level2_id: null,
      level3_id: null,
      level4_id: null,
      level5_id: null,
    });
  });
});
