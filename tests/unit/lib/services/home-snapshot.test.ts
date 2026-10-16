/**
 * 首页快照服务（home-snapshot）回归测试
 *
 * 钉住「服务端直出与公开端点同口径」的装配关系：
 * - 四个数字全部来自既有 service/repo，不新增 SQL 算法；
 * - countryCount 恒等于 countries 长度（与客户端 useHomeStats 同一派生规则）；
 * - 任一路失败整体抛出（页面调用方负责降级，服务不吞错）。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getNoticeStats: vi.fn(),
  getNoticeCountries: vi.fn(),
  getNoticeDailyNew: vi.fn(),
  listDirectoryPaginated: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/notice-search", () => ({
  getNoticeStats: mocks.getNoticeStats,
  getNoticeCountries: mocks.getNoticeCountries,
  getNoticeDailyNew: mocks.getNoticeDailyNew,
}));
vi.mock("@/lib/db/context", () => ({
  getContext: () => ({ supplier: { directoryRepo: { listDirectoryPaginated: mocks.listDirectoryPaginated } } }),
}));

import { getHomeSnapshot } from "@/lib/services/home-snapshot";

const pool = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getNoticeStats.mockResolvedValue({ active: 10233, raw: 20000 });
  mocks.getNoticeCountries.mockResolvedValue([{ country: "CN", count: 5 }, { country: "US", count: 2 }]);
  mocks.getNoticeDailyNew.mockResolvedValue({ todayNew: 42, yesterdayNew: 30 });
  mocks.listDirectoryPaginated.mockResolvedValue({ items: [], total: 380 });
});

describe("getHomeSnapshot", () => {
  it("装配形状与 HomeStatsData 一致，各值取自单一口径 service", async () => {
    await expect(getHomeSnapshot(pool)).resolves.toEqual({
      noticeActive: 10233,
      noticeTodayNew: 42,
      countryCount: 2,
      certifiedSupplierCount: 380,
      countries: [{ country: "CN", count: 5 }, { country: "US", count: 2 }],
    });
    // 供应商总数必须走与 /api/suppliers 分页分支同一的 repo 调用（limit:1 拿 total）
    expect(mocks.listDirectoryPaginated).toHaveBeenCalledWith({ limit: 1, offset: 0 });
  });

  it("任一路失败整体抛错，留给页面调用方降级", async () => {
    mocks.getNoticeDailyNew.mockRejectedValue(new Error("db down"));
    await expect(getHomeSnapshot(pool)).rejects.toThrow("db down");
  });
});
