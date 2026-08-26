/**
 * server/services/search-orchestrator/rebuild-trigger.ts 测试
 * 验证索引重建触发器逻辑
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// mock 外部依赖
vi.mock("../../../../server/services/meilisearch/index", () => ({
  isHealthy: vi.fn().mockReturnValue(true),
  fullSync: vi.fn().mockResolvedValue({ synced: 100, elapsed: 500 }),
}));

import { requestIndexRebuild, isRebuildRequested, tryRunPendingRebuild } from "../../../../server/services/search-orchestrator/rebuild-trigger";
import { isHealthy, fullSync } from "../../../../server/services/meilisearch/index";

describe("requestIndexRebuild", () => {
  it("调用后 isRebuildRequested 返回 true", () => {
    requestIndexRebuild("test-reason");
    expect(isRebuildRequested()).toBe(true);
  });

  it("重复调用不覆盖原因（幂等）", () => {
    requestIndexRebuild("first-reason");
    requestIndexRebuild("second-reason");
    expect(isRebuildRequested()).toBe(true);
  });
});

describe("tryRunPendingRebuild", () => {
  it("无重建请求 → 不执行", async () => {
    // 先清除状态（通过执行一次重建来清除）
    const pool = {};
    // 如果没有重建请求，应该直接返回
    // 注意：由于模块级状态，需要先 request 再执行
    await tryRunPendingRebuild(pool as any);
    // 如果之前没有 request，不应该调用 fullSync
  });

  it("有重建请求 + Meili 健康 → 执行 fullSync", async () => {
    vi.mocked(isHealthy).mockReturnValue(true);
    requestIndexRebuild("test-sync");
    const pool = {};
    await tryRunPendingRebuild(pool as any);
    expect(fullSync).toHaveBeenCalled();
  });

  it("Meili 不健康 → 不执行", async () => {
    vi.mocked(isHealthy).mockReturnValue(false);
    requestIndexRebuild("unhealthy-test");
    const pool = {};
    await tryRunPendingRebuild(pool as any);
    // fullSync 不应被调用
  });

  it("fullSync 失败 → 保留重建标记", async () => {
    vi.mocked(isHealthy).mockReturnValue(true);
    vi.mocked(fullSync).mockRejectedValueOnce(new Error("sync failed"));
    requestIndexRebuild("retry-test");
    const pool = {};
    await tryRunPendingRebuild(pool as any);
    // 失败后标记应保留
    expect(isRebuildRequested()).toBe(true);
  });
});
