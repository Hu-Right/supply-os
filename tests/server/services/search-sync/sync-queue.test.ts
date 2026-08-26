/**
 * server/services/search-sync/sync-queue.ts 测试
 * 验证宽表同步队列的去重、批量处理逻辑
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/search-sync/sync-scheduler", () => ({
  syncWideIds: vi.fn().mockResolvedValue({ synced: 3 }),
}));

import { enqueue, processQueue, clearQueue, getQueueSize } from "../../../../server/services/search-sync/sync-queue";
import { syncWideIds } from "../../../../server/services/search-sync/sync-scheduler";

beforeEach(() => {
  clearQueue();
  vi.clearAllMocks();
});

describe("enqueue", () => {
  it("有效 ID 入队", () => {
    enqueue({} as any, [1, 2, 3]);
    expect(getQueueSize()).toBe(3);
  });

  it("无效 ID 被过滤（负数/零/NaN）", () => {
    enqueue({} as any, [-1, 0, NaN, Infinity, 5]);
    expect(getQueueSize()).toBe(1);
  });

  it("重复 ID 自动去重（Set 特性）", () => {
    enqueue({} as any, [1, 1, 2, 2, 3]);
    expect(getQueueSize()).toBe(3);
  });
});

describe("processQueue", () => {
  it("空队列 → 返回 { synced: 0 }", async () => {
    const result = await processQueue({} as any);
    expect(result).toEqual({ synced: 0 });
    expect(syncWideIds).not.toHaveBeenCalled();
  });

  it("有 ID → 调用 syncWideIds 并返回结果", async () => {
    enqueue({} as any, [10, 20, 30]);
    const result = await processQueue({} as any);
    expect(result).toEqual({ synced: 3 });
    expect(syncWideIds).toHaveBeenCalledWith({}, [10, 20, 30]);
  });

  it("处理后队列清空", async () => {
    enqueue({} as any, [1, 2]);
    await processQueue({} as any);
    expect(getQueueSize()).toBe(0);
  });

  it("syncWideIds 异常 → 返回 { synced: 0 }，不抛出", async () => {
    vi.mocked(syncWideIds).mockRejectedValueOnce(new Error("sync error"));
    enqueue({} as any, [1]);
    const result = await processQueue({} as any);
    expect(result).toEqual({ synced: 0 });
  });
});

describe("clearQueue", () => {
  it("清空队列", () => {
    enqueue({} as any, [1, 2, 3]);
    clearQueue();
    expect(getQueueSize()).toBe(0);
  });
});
