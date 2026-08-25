/**
 * server/services/meilisearch/ 单元测试
 * 覆盖 segmentZh.ts (中文分词), client.ts (健康状态管理)
 */
import { describe, it, expect, beforeEach } from "vitest";

// ── segmentZh.ts ──
import { segmentZh, segmentZhBatch } from "../../../../server/services/meilisearch/segmentZh";

describe("segmentZh", () => {
  it("空字符串返回空", () => {
    expect(segmentZh("")).toBe("");
  });

  it("纯英文文本原样返回（不分词）", () => {
    expect(segmentZh("Request for Quotation")).toBe("Request for Quotation");
  });

  it("纯数字文本原样返回", () => {
    expect(segmentZh("12345")).toBe("12345");
  });

  it("中文文本执行 jieba 分词", () => {
    const result = segmentZh("联合国采购公告");
    // jieba 分词结果以空格分隔
    expect(result).toContain(" ");
    expect(result.length).toBeGreaterThan(0);
  });

  it("中英混合文本仅对中文部分分词", () => {
    const result = segmentZh("UNDP采购公告");
    // 应包含分词结果
    expect(result.length).toBeGreaterThan(0);
  });

  it("null/undefined 返回空字符串", () => {
    expect(segmentZh(null as any)).toBe("");
    expect(segmentZh(undefined as any)).toBe("");
  });
});

describe("segmentZhBatch", () => {
  it("空数组返回空数组", () => {
    expect(segmentZhBatch([])).toEqual([]);
  });

  it("批量处理多个文本", () => {
    const input = ["English text", "联合国采购", "12345"];
    const result = segmentZhBatch(input);
    expect(result.length).toBe(3);
    // 英文不变
    expect(result[0]).toBe("English text");
    // 数字不变
    expect(result[2]).toBe("12345");
    // 中文已分词（含空格）
    expect(result[1]).toContain(" ");
  });
});

// ── client.ts 状态管理 ──
import { isHealthy, markUnhealthy, getIndexName } from "../../../../server/services/meilisearch/client";

describe("meilisearch client state", () => {
  describe("getIndexName", () => {
    it("返回固定索引名", () => {
      expect(getIndexName()).toBe("notices");
    });
  });

  describe("isHealthy / markUnhealthy", () => {
    it("markUnhealthy 后 isHealthy 返回 false", () => {
      markUnhealthy();
      expect(isHealthy()).toBe(false);
    });

    it("连续调用 markUnhealthy 不抛错", () => {
      expect(() => {
        markUnhealthy();
        markUnhealthy();
      }).not.toThrow();
    });
  });
});
