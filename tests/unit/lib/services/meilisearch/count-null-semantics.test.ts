/**
 * getDocCount / getLastSyncedId / hasHasDeadlineField 的「读不到」语义回归
 *
 * 修复背景（2026-11-19）：这三个函数原来在「不健康 / 请求异常」时返回 0/false，
 * 而 search-sync 的 init() 把 docCount === 0 判定为「索引为空」→ 触发全量重建。
 * 实测每次 dev 冷启动都会重建 55 万文档（约 19 分钟，打满 MySQL 隧道）。
 * 现约定：读不到一律返回 null，0/false 只代表「读到了且确实是空/无该字段」。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

import { getDocCount, getLastSyncedId, getCachedDocCount, hasHasDeadlineField } from "@/lib/services/meilisearch/client";

type MeiliGlobal = typeof globalThis & {
  _meiliClient: unknown;
  _meiliHealthy: boolean;
};

const g = globalThis as MeiliGlobal;

function setClient(overrides: { getStats?: () => Promise<unknown>; search?: () => Promise<unknown> }) {
  g._meiliClient = {
    index: () => ({
      getStats: overrides.getStats ?? (async () => ({ numberOfDocuments: 42 })),
      search: overrides.search ?? (async () => ({ hits: [{ id: 7 }] })),
    }),
  };
}

describe("索引计数读取的 null 语义", () => {
  beforeEach(() => {
    g._meiliHealthy = true;
  });

  it("健康且查询成功时返回真实值", async () => {
    setClient({});
    expect(await getDocCount()).toBe(42);
    expect(await getLastSyncedId()).toBe(7);
    expect(await hasHasDeadlineField()).toBe(false);
  });

  it("索引确实为空时返回 0（而不是 null）", async () => {
    g._meiliClient = {
      index: () => ({
        getStats: async () => ({ numberOfDocuments: 0 }),
        search: async () => ({ hits: [] }),
      }),
    };
    expect(await getDocCount()).toBe(0);
    expect(await getLastSyncedId()).toBe(0);
  });

  it("请求异常时返回 null，调用方不得当作 0", async () => {
    setClient({
      getStats: async () => {
        throw new Error("stats timeout");
      },
      search: async () => {
        throw new Error("search timeout");
      },
    });
    expect(await getDocCount()).toBeNull();
    expect(await getLastSyncedId()).toBeNull();
    expect(await hasHasDeadlineField()).toBeNull();
  });

  it("健康位为 false（新进程初始态）时返回 null", async () => {
    g._meiliHealthy = false;
    setClient({});
    expect(await getDocCount()).toBeNull();
    expect(await getLastSyncedId()).toBeNull();
    expect(await hasHasDeadlineField()).toBeNull();
  });

  it("getCachedDocCount 不缓存 null（失败后下一次仍重新查询）", async () => {
    g._meiliClient = {
      index: () => ({
        getStats: async () => {
          throw new Error("boom");
        },
        search: async () => ({ hits: [] }),
      }),
    };
    expect(await getCachedDocCount()).toBeNull();

    // 恢复后应立刻读到真实值，说明 null 没有被写进 60s 缓存
    g._meiliClient = {
      index: () => ({
        getStats: async () => ({ numberOfDocuments: 1234 }),
        search: async () => ({ hits: [] }),
      }),
    };
    expect(await getCachedDocCount()).toBe(1234);
  });
});