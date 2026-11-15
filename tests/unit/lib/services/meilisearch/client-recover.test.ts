/**
 * @module tests/unit/lib/services/meilisearch/client-recover.test.ts
 * @description tryRecover 的探测节奏必须独立于 markUnhealthy 写的失败时间戳。
 *
 * 回归背景（2026-11-15）：两者原先共用 _meiliLastFailureTs 做 10 秒冷却，
 * 降级期间任何别的失败源（后台同步、并发搜索）一刷新该时间戳，「下次可探测」
 * 就被往后推，探测永远进不来 —— 本机 Meilisearch 晚起 4 分钟，之后 45 分钟
 * 一次都没恢复，搜索全程 32 秒返回 0 条，只能重启应用。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { healthMock } = vi.hoisted(() => ({ healthMock: vi.fn() }));

vi.mock("meilisearch", () => ({
  Meilisearch: class MockMeilisearch {
    health = healthMock;
    createIndex = vi.fn().mockResolvedValue(undefined);
    index() {
      return {
        search: vi.fn(),
        updateSettings: vi.fn().mockResolvedValue(undefined),
        getStats: vi.fn(),
      };
    }
  },
}));

import { tryRecover } from "@/lib/services/meilisearch/client";

type MeiliGlobals = {
  _meiliClient?: unknown;
  _meiliHealthy?: boolean;
  _meiliLastFailureTs?: number;
  _meiliFailureStreak?: number;
  _meiliLastProbeTs?: number;
};
const g = globalThis as unknown as MeiliGlobals;

describe("tryRecover 探测节奏", () => {
  beforeEach(() => {
    healthMock.mockReset();
    g._meiliClient = undefined;
    g._meiliHealthy = false;
    g._meiliLastFailureTs = 0;
    g._meiliFailureStreak = 0;
    g._meiliLastProbeTs = 0;
  });

  it("失败时间戳刚被刷新过，探测时间已过冷却 → 仍然探测并恢复", async () => {
    healthMock.mockResolvedValue({ status: "available" });
    const now = Date.now();
    // 刚刚又失败了一次（旧实现据此判定「冷却中」，直接返回 false）
    g._meiliLastFailureTs = now;
    g._meiliFailureStreak = 5;
    // 上次探测已是 20 秒前
    g._meiliLastProbeTs = now - 20_000;

    await expect(tryRecover()).resolves.toBe(true);
    expect(healthMock).toHaveBeenCalledTimes(1);
    expect(g._meiliHealthy).toBe(true);
  });

  it("探测自身在冷却期内 → 不重复打 Meilisearch", async () => {
    healthMock.mockResolvedValue({ status: "available" });
    g._meiliLastProbeTs = Date.now(); // 刚探过

    await expect(tryRecover()).resolves.toBe(false);
    expect(healthMock).not.toHaveBeenCalled();
  });

  it("探测失败 → 记录原因并在冷却后允许再次探测", async () => {
    healthMock.mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:7700"));
    const before = Date.now();

    await expect(tryRecover()).resolves.toBe(false);
    expect(g._meiliHealthy).toBe(false);
    expect(g._meiliLastProbeTs).toBeGreaterThanOrEqual(before);

    // 冷却期内不重复
    await expect(tryRecover()).resolves.toBe(false);
    expect(healthMock).toHaveBeenCalledTimes(1);

    // 冷却期过后（把探测时间拨回 20 秒前）→ 重新探测
    g._meiliLastProbeTs = Date.now() - 20_000;
    healthMock.mockResolvedValue({ status: "available" });
    await expect(tryRecover()).resolves.toBe(true);
    expect(healthMock).toHaveBeenCalledTimes(2);
  });
});
