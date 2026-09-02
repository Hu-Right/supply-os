import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool } from "mysql2/promise";

// Mock Meilisearch 索引同步入口（避免加载真实 Meilisearch client）
vi.mock("../meilisearch/index", () => ({
  fullSync: vi.fn(),
  isHealthy: vi.fn(),
}));

import { fullSync, isHealthy } from "../meilisearch/index";
import {
  requestIndexRebuild,
  isRebuildRequested,
  tryRunPendingRebuild,
} from "./rebuild-trigger";

const mockFullSync = vi.mocked(fullSync);
const mockIsHealthy = vi.mocked(isHealthy);
const noopPool = {} as Pool;

describe("rebuild-trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 模块级标记为单例状态机（无 reset 出口），用例按状态流转顺序串联：
  // 无请求 → 已标记（不健康保留 / 健康消费 / 失败恢复）→ 并发防护

  it("无待处理请求 → tryRunPendingRebuild 直接返回（不探活）", async () => {
    expect(isRebuildRequested()).toBe(false);
    await tryRunPendingRebuild(noopPool);
    expect(mockIsHealthy).not.toHaveBeenCalled();
    expect(mockFullSync).not.toHaveBeenCalled();
  });

  it("requestIndexRebuild → isRebuildRequested=true；重复请求幂等（不覆盖原因）", () => {
    requestIndexRebuild("reason_a");
    requestIndexRebuild("reason_b");
    expect(isRebuildRequested()).toBe(true);
  });

  it("Meilisearch 不健康 → 不执行重建，标记保留待下次", async () => {
    mockIsHealthy.mockReturnValue(false);
    await tryRunPendingRebuild(noopPool);
    expect(mockFullSync).not.toHaveBeenCalled();
    expect(isRebuildRequested()).toBe(true);
  });

  it("健康 → 执行 fullSync 并清除标记；再次调用为 no-op", async () => {
    mockIsHealthy.mockReturnValue(true);
    mockFullSync.mockResolvedValueOnce({ synced: 5, elapsed: 10, lastId: 99 });

    await tryRunPendingRebuild(noopPool);
    expect(mockFullSync).toHaveBeenCalledTimes(1);
    expect(mockFullSync).toHaveBeenCalledWith(noopPool);
    expect(isRebuildRequested()).toBe(false);

    // 标记已消费 → 第二次调用不再触发重建
    await tryRunPendingRebuild(noopPool);
    expect(mockFullSync).toHaveBeenCalledTimes(1);
  });

  it("fullSync 失败 → 标记恢复 true，下个周期自动重试", async () => {
    requestIndexRebuild("reason_fail");
    mockIsHealthy.mockReturnValue(true);
    mockFullSync.mockRejectedValueOnce(new Error("meili down"));

    await tryRunPendingRebuild(noopPool);
    expect(isRebuildRequested()).toBe(true);
  });

  it("并发防护：重建进行中(_rebuilding)的第二次调用直接返回", async () => {
    mockIsHealthy.mockReturnValue(true);
    let resolveSync!: (v: { synced: number; elapsed: number; lastId: number }) => void;
    mockFullSync.mockImplementationOnce(
      () => new Promise((resolve) => { resolveSync = resolve; }),
    );

    // first 消费上一步恢复的标记并挂起在 fullSync；second 因 _rebuilding=true 直接返回
    const first = tryRunPendingRebuild(noopPool);
    const second = tryRunPendingRebuild(noopPool);
    resolveSync({ synced: 1, elapsed: 1, lastId: 1 });
    await Promise.all([first, second]);

    expect(mockFullSync).toHaveBeenCalledTimes(1);
    expect(isRebuildRequested()).toBe(false);
  });
});
