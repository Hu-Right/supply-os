/**
 * server/services/search-sync/sync-retry-queue.ts 补充测试
 * 覆盖 enqueueRetry + getRetryQueueSize + startSyncRetryQueue
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/meilisearch/index", () => ({
  syncNoticeIds: vi.fn().mockResolvedValue({ synced: 0, deleted: 0 }),
  isHealthy: vi.fn().mockReturnValue(true),
}));

vi.mock("../../../../server/services/meilisearch/client", () => ({
  tryRecover: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../../../server/services/search-orchestrator/metrics", () => ({
  logSyncCascade: vi.fn(),
}));

import { enqueueRetry, getRetryQueueSize, startSyncRetryQueue } from "../../../../server/services/search-sync/sync-retry-queue";

describe("enqueueRetry", () => {
  it("有效 ID 入队", () => {
    enqueueRetry([1, 2, 3]);
    expect(getRetryQueueSize()).toBeGreaterThanOrEqual(3);
  });

  it("无效 ID 被过滤", () => {
    const before = getRetryQueueSize();
    enqueueRetry([-1, 0, NaN, Infinity]);
    expect(getRetryQueueSize()).toBe(before);
  });

  it("重复 ID 不增加计数", () => {
    enqueueRetry([999]);
    const size1 = getRetryQueueSize();
    enqueueRetry([999]);
    expect(getRetryQueueSize()).toBe(size1);
  });
});

describe("startSyncRetryQueue", () => {
  it("返回停止函数", () => {
    const pool = { query: vi.fn() } as any;
    const stop = startSyncRetryQueue(pool);
    expect(typeof stop).toBe("function");
    stop(); // 清理
  });

  it("重复启动 → 返回 noop 停止函数", () => {
    const pool = { query: vi.fn() } as any;
    const stop1 = startSyncRetryQueue(pool);
    const stop2 = startSyncRetryQueue(pool);
    expect(typeof stop2).toBe("function");
    stop1();
    stop2();
  });
});
