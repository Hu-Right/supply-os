/**
 * server/services/search-sync/sync-retry-queue.ts 测试
 * 验证级联同步重试队列入队逻辑
 *
 * 注意：_queue 为模块级 Map，跨测试持久化。
 *       测试仅验证入队行为（增量），不假设初始为空。
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../../server/services/meilisearch/index", () => ({
  syncNoticeIds: vi.fn().mockResolvedValue({ synced: 3, deleted: 0 }),
  isHealthy: vi.fn().mockReturnValue(true),
}));
vi.mock("../../../../server/services/meilisearch/client", () => ({
  tryRecover: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../../../server/services/search-orchestrator/metrics", () => ({
  logSyncCascade: vi.fn(),
}));

import { enqueueRetry, getRetryQueueSize } from "../../../../server/services/search-sync/sync-retry-queue";

describe("enqueueRetry", () => {
  it("有效 ID 入队后队列增大", () => {
    const before = getRetryQueueSize();
    enqueueRetry([100, 200, 300]);
    expect(getRetryQueueSize()).toBe(before + 3);
  });

  it("NaN/Infinity 不入队（但负数和 0 取决于实现）", () => {
    const before = getRetryQueueSize();
    enqueueRetry([NaN, Infinity]);
    // NaN 和 Infinity 不满足 Number.isFinite(id) && id > 0
    expect(getRetryQueueSize()).toBe(before);
  });

  it("重复 ID 不增加已有条目的计数（Map set 覆盖）", () => {
    enqueueRetry([999]);
    const afterFirst = getRetryQueueSize();
    enqueueRetry([999]);
    // 999 已存在，Map.set 覆盖但不增加 size
    expect(getRetryQueueSize()).toBe(afterFirst);
  });
});
