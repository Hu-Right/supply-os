/**
 * server/services/search-sync/ 单元测试
 * 覆盖 sync-queue.ts (enqueue/clearQueue/getQueueSize),
 *       sync-retry-queue.ts (enqueueRetry/getRetryQueueSize),
 *       wide-row-builder.ts (buildCodeLevelMap/SUPPORTED_LANGS)
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { Pool } from "mysql2/promise";

// ── sync-queue.ts ──
import { enqueue, clearQueue, getQueueSize } from "../../../../server/services/search-sync/sync-queue";

describe("sync-queue", () => {
  beforeEach(() => {
    clearQueue();
  });

  it("初始队列为空", () => {
    expect(getQueueSize()).toBe(0);
  });

  it("enqueue 添加有效 ID", () => {
    const mockPool = {} as Pool;
    enqueue(mockPool, [1, 2, 3]);
    expect(getQueueSize()).toBe(3);
  });

  it("enqueue 过滤无效 ID（负数/零/非数字）", () => {
    const mockPool = {} as Pool;
    enqueue(mockPool, [1, -1, 0, NaN, Infinity, 5]);
    expect(getQueueSize()).toBe(2); // 只有 1 和 5
  });

  it("enqueue 自动去重（Set 特性）", () => {
    const mockPool = {} as Pool;
    enqueue(mockPool, [1, 2, 3]);
    enqueue(mockPool, [2, 3, 4]);
    expect(getQueueSize()).toBe(4); // 1,2,3,4
  });

  it("clearQueue 清空队列", () => {
    const mockPool = {} as Pool;
    enqueue(mockPool, [1, 2, 3]);
    expect(getQueueSize()).toBe(3);
    clearQueue();
    expect(getQueueSize()).toBe(0);
  });
});

// ── sync-retry-queue.ts ──
import { enqueueRetry, getRetryQueueSize } from "../../../../server/services/search-sync/sync-retry-queue";

describe("sync-retry-queue", () => {
  it("enqueueRetry 添加有效 ID", () => {
    const before = getRetryQueueSize();
    enqueueRetry([100, 200, 300]);
    expect(getRetryQueueSize()).toBe(before + 3);
  });

  it("enqueueRetry 过滤无效 ID（负数/零/NaN）", () => {
    const before = getRetryQueueSize();
    enqueueRetry([-1, 0, NaN]);
    // 无效 ID 不应增加队列大小
    expect(getRetryQueueSize()).toBe(before);
  });

  it("enqueueRetry 重复 ID 不增加计数（Map 特性）", () => {
    const before = getRetryQueueSize();
    enqueueRetry([501, 502]);
    const afterFirst = getRetryQueueSize();
    expect(afterFirst).toBe(before + 2);
    // 重复入队相同 ID
    enqueueRetry([501, 502]);
    // 队列大小不变（Map 覆盖）
    expect(getRetryQueueSize()).toBe(afterFirst);
  });
});

// ── wide-row-builder.ts ──
import { buildCodeLevelMap, SUPPORTED_LANGS } from "../../../../server/services/search-sync/wide-row-builder";

describe("wide-row-builder", () => {
  describe("SUPPORTED_LANGS", () => {
    it("包含 6 种语言", () => {
      expect(SUPPORTED_LANGS).toEqual(["zh", "en", "fr", "ru", "es", "ar"]);
    });
  });

  describe("buildCodeLevelMap", () => {
    it("空数组返回空 Map", () => {
      const result = buildCodeLevelMap([]);
      expect(result.size).toBe(0);
    });

    it("正确映射候选码到五级 ID", () => {
      const rows = [
        { code: "12345678", l1: "10", l2: "100", l3: "1000", l4: "10000", l5: "100000" },
        { code: "87654321", l1: "20", l2: "200", l3: "2000", l4: "20000", l5: "200000" },
      ];
      const result = buildCodeLevelMap(rows as any);
      expect(result.size).toBe(2);
      expect(result.get("12345678")).toEqual({
        level1: "10", level2: "100", level3: "1000", level4: "10000", level5: "100000",
      });
      expect(result.get("87654321")).toEqual({
        level1: "20", level2: "200", level3: "2000", level4: "20000", level5: "200000",
      });
    });

    it("空 code 字段被跳过", () => {
      const rows = [
        { code: "", l1: "10", l2: "100", l3: "1000", l4: "10000", l5: "100000" },
        { code: "  ", l1: "20", l2: "200", l3: "2000", l4: "20000", l5: "200000" },
        { code: "valid", l1: "30", l2: "300", l3: "3000", l4: "30000", l5: "300000" },
      ];
      const result = buildCodeLevelMap(rows as any);
      expect(result.size).toBe(1);
      expect(result.has("valid")).toBe(true);
    });

    it("缺失的 level 字段转为空字符串", () => {
      const rows = [
        { code: "test", l1: "10" }, // l2-l5 缺失
      ];
      const result = buildCodeLevelMap(rows as any);
      expect(result.get("test")).toEqual({
        level1: "10", level2: "", level3: "", level4: "", level5: "",
      });
    });
  });
});
