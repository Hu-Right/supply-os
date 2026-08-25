/**
 * server/services/unspsc/ 子模块测试
 * 覆盖纯函数：parser（码归一化、前缀提取、补位）+ tree-cache（缓存操作）
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  normalizeUnspscCodes,
  unspscPrefixFromCode,
  expandUnspscInterestPrefixes,
  padUnspscPrefix,
} from "../../../../server/services/unspsc/parser";
import {
  loadUnspscCache,
  getPathFromCache,
  getCodeIdFromCache,
  getUnspscLevelFromCache,
  clearUnspscCache,
} from "../../../../server/services/unspsc/tree-cache";

// ── parser ──
describe("normalizeUnspscCodes", () => {
  it("JSON 字符串解析", () => {
    const result = normalizeUnspscCodes('[{"code":"42142300","name":"Medical"}]');
    expect(result.length).toBe(1);
    expect(result[0].code).toBe("42142300");
    expect(result[0].name).toBe("Medical");
  });

  it("嵌套数组递归提取", () => {
    const result = normalizeUnspscCodes([{ code: "50201200", name: "IT" }]);
    expect(result.length).toBe(1);
    expect(result[0].code).toBe("50201200");
  });

  it("纯字符串提取码", () => {
    const result = normalizeUnspscCodes("42142300");
    expect(result.length).toBe(1);
    expect(result[0].code).toBe("42142300");
  });

  it("去重相同码", () => {
    const result = normalizeUnspscCodes('[{"code":"42142300"},{"code":"42142300"}]');
    expect(result.length).toBe(1);
  });

  it("最多 20 条", () => {
    const arr = Array.from({ length: 25 }, (_, i) => ({
      code: String(10000000 + i * 100), name: `item-${i}`,
    }));
    const result = normalizeUnspscCodes(arr);
    expect(result.length).toBeLessThanOrEqual(20);
  });

  it("无效码（非数字格式）返回空", () => {
    expect(normalizeUnspscCodes("no codes here")).toEqual([]);
    expect(normalizeUnspscCodes(null)).toEqual([]);
    expect(normalizeUnspscCodes(undefined)).toEqual([]);
  });

  it("只匹配 2/4/6/8 位码", () => {
    const result = normalizeUnspscCodes("4214");
    expect(result.length).toBe(1);
    expect(result[0].code).toBe("4214");
  });
});

describe("unspscPrefixFromCode", () => {
  it("去除尾部 00 段", () => {
    expect(unspscPrefixFromCode("42140000")).toBe("4214");
    expect(unspscPrefixFromCode("42000000")).toBe("42");
  });

  it("无尾部 00 保持完整", () => {
    expect(unspscPrefixFromCode("42142301")).toBe("42142301");
  });

  it("空/无效输入返回空字符串", () => {
    expect(unspscPrefixFromCode("")).toBe("");
    expect(unspscPrefixFromCode(null as any)).toBe("");
    expect(unspscPrefixFromCode("abc")).toBe("");
  });

  it("截断超过 8 位", () => {
    expect(unspscPrefixFromCode("4214230112345")).toBe("42142301");
  });
});

describe("expandUnspscInterestPrefixes", () => {
  it("8 位码展开所有层级前缀", () => {
    const prefixes = expandUnspscInterestPrefixes("42142300");
    // 42142300 → prefix=4214 → 展开: 42, 4214
    expect(prefixes).toContain("42");
    expect(prefixes).toContain("4214");
  });

  it("2 位码只返回自身", () => {
    const prefixes = expandUnspscInterestPrefixes("42");
    expect(prefixes).toEqual(["42"]);
  });

  it("空输入返回空数组", () => {
    expect(expandUnspscInterestPrefixes("")).toEqual([]);
  });
});

describe("padUnspscPrefix", () => {
  it("短前缀补 0 至 8 位", () => {
    expect(padUnspscPrefix("42")).toBe("42000000");
    expect(padUnspscPrefix("4214")).toBe("42140000");
  });

  it("已 8 位不变", () => {
    expect(padUnspscPrefix("42142301")).toBe("42142301");
  });

  it("空输入补零", () => {
    expect(padUnspscPrefix("")).toBe("00000000");
    expect(padUnspscPrefix(null as any)).toBe("00000000");
  });
});

// ── tree-cache ──
describe("tree-cache", () => {
  beforeEach(() => {
    clearUnspscCache();
  });

  it("缓存未加载时 getPathFromCache 返回全 null", () => {
    const path = getPathFromCache(1);
    expect(path.level1_id).toBeNull();
    expect(path.level5_id).toBeNull();
  });

  it("缓存未加载时 getCodeIdFromCache 返回 undefined", () => {
    expect(getCodeIdFromCache("42142300")).toBeUndefined();
  });

  it("缓存未加载时 getUnspscLevelFromCache 返回 undefined", () => {
    expect(getUnspscLevelFromCache(1)).toBeUndefined();
  });

  it("loadUnspscCache 加载后可查询", async () => {
    const mockPool = {
      query: async () => [[
        { id: 1, code: "42", level: 1, parent_id: null },
        { id: 2, code: "4214", level: 2, parent_id: 1 },
        { id: 3, code: "421423", level: 3, parent_id: 2 },
      ]],
    };
    const ok = await loadUnspscCache(mockPool);
    expect(ok).toBe(true);

    expect(getCodeIdFromCache("42")).toBe(1);
    expect(getCodeIdFromCache("4214")).toBe(2);
    expect(getUnspscLevelFromCache(1)).toBe(1);
    expect(getUnspscLevelFromCache(2)).toBe(2);

    const path = getPathFromCache(3);
    expect(path.level3_id).toBe(3);
    expect(path.level2_id).toBe(2);
    expect(path.level1_id).toBe(1);
  });

  it("loadUnspscCache 幂等（已加载直接返回 true）", async () => {
    const mockPool = { query: async () => [[]] };
    await loadUnspscCache(mockPool);
    const ok = await loadUnspscCache(mockPool);
    expect(ok).toBe(true);
  });

  it("loadUnspscCache 查询失败返回 false", async () => {
    const mockPool = { query: async () => { throw new Error("DB down"); } };
    const ok = await loadUnspscCache(mockPool);
    expect(ok).toBe(false);
  });

  it("clearUnspscCache 清除后查询返回 undefined", async () => {
    const mockPool = { query: async () => [[{ id: 1, code: "42", level: 1, parent_id: null }]] };
    await loadUnspscCache(mockPool);
    clearUnspscCache();
    expect(getCodeIdFromCache("42")).toBeUndefined();
  });
});
