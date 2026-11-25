/**
 * 首页快照服务（home-snapshot）回归测试
 *
 * 钉住「服务端直出与公开端点同口径」的装配关系：
 * - 四个数字全部来自既有 service/repo，不新增 SQL 算法；
 * - countryCount 取 getNoticeStats 的服务表主国家口径（与客户端 useHomeStats 同一派生规则）；
 * - 任一路失败整体抛出（页面调用方负责降级，服务不吞错）。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getHomeNoticeStats: vi.fn(),
  getNoticeCountries: vi.fn(),
  getNoticeDailyNew: vi.fn(),
  countAll: vi.fn(),
  countApproved: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/notice-search", () => ({
  getHomeNoticeStats: mocks.getHomeNoticeStats,
  getNoticeCountries: mocks.getNoticeCountries,
  getNoticeDailyNew: mocks.getNoticeDailyNew,
}));
vi.mock("@/lib/db/context", () => ({
  getContext: () => ({ supplier: { directoryRepo: { countAll: mocks.countAll, countApproved: mocks.countApproved } } }),
}));

import { getHomeSnapshot, clearHomeSnapshotCache } from "@/lib/services/home-snapshot";

const pool = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  clearHomeSnapshotCache();
  mocks.getHomeNoticeStats.mockResolvedValue({ active: 10233, countryCount: 189 });
  mocks.getNoticeCountries.mockResolvedValue([{ country: "CN", count: 5 }, { country: "US", count: 2 }]);
  mocks.getNoticeDailyNew.mockResolvedValue({ todayNew: 42, yesterdayNew: 30 });
  mocks.countAll.mockResolvedValue(102624);
  mocks.countApproved.mockResolvedValue(380);
});

describe("getHomeSnapshot", () => {
  it("装配形状与 HomeStatsData 一致，各值取自单一口径 service", async () => {
    await expect(getHomeSnapshot(pool)).resolves.toEqual({
      noticeActive: 10233,
      noticeTodayNew: 42,
      countryCount: 189,
      certifiedSupplierCount: 380,
      supplierTotal: 102624,
      countries: [{ country: "CN", count: 5 }, { country: "US", count: 2 }],
    });
    // 数字墙供应商总数 = 全表口径 countAll；认证供应商 = countApproved，与 /api/suppliers/stats 同源
    expect(mocks.countAll).toHaveBeenCalledTimes(1);
    expect(mocks.countApproved).toHaveBeenCalledTimes(1);
  });

  it("任一路失败整体抛错，留给页面调用方降级", async () => {
    mocks.getNoticeDailyNew.mockRejectedValue(new Error("db down"));
    await expect(getHomeSnapshot(pool)).rejects.toThrow("db down");
  });
});
