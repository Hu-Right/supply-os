/**
 * src/features/membership/api.ts 测试
 * 覆盖 fetchMembershipPlans, fetchMembershipStatus, fetchUpgradePreview
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiMock = vi.fn();
const apiCachedMock = vi.fn();
vi.mock("@/core/http", () => ({
  api: (...args: any[]) => apiMock(...args),
  apiCached: (...args: any[]) => apiCachedMock(...args),
}));

import {
  fetchMembershipPlans, fetchPlans,
  fetchMembershipStatus,
  fetchUpgradePreview,
} from "@/features/membership/api";

describe("fetchMembershipPlans", () => {
  beforeEach(() => {
    apiCachedMock.mockReset();
    apiCachedMock.mockResolvedValue([]);
  });

  it("调用 apiCached 获取套餐列表", async () => {
    const plans = [{ plan_code: "basic", name: "基础版" }];
    apiCachedMock.mockResolvedValue(plans);
    const result = await fetchMembershipPlans();
    expect(apiCachedMock).toHaveBeenCalledWith("/api/membership/plans");
    expect(result).toEqual(plans);
  });

  it("fetchPlans 是 fetchMembershipPlans 的别名", () => {
    expect(fetchPlans).toBe(fetchMembershipPlans);
  });
});

describe("fetchMembershipStatus", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiCachedMock.mockReset();
  });

  it("默认不走缓存（useCache=false）", async () => {
    apiMock.mockResolvedValue({ quota: 10 });
    await fetchMembershipStatus();
    expect(apiMock).toHaveBeenCalledWith("/api/membership/status");
    expect(apiCachedMock).not.toHaveBeenCalled();
  });

  it("useCache=true 走 apiCached", async () => {
    apiCachedMock.mockResolvedValue({ quota: 10 });
    await fetchMembershipStatus(true);
    expect(apiCachedMock).toHaveBeenCalledWith("/api/membership/status");
    expect(apiMock).not.toHaveBeenCalled();
  });
});

describe("fetchUpgradePreview", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  it("URL 编码 targetPlanCode", async () => {
    apiMock.mockResolvedValue({ price_diff: 100 });
    await fetchUpgradePreview("annual_799");
    expect(apiMock).toHaveBeenCalledWith(
      expect.stringContaining("target_plan_code=annual_799"),
    );
  });

  it("特殊字符被编码", async () => {
    apiMock.mockResolvedValue({});
    await fetchUpgradePreview("plan with spaces");
    expect(apiMock).toHaveBeenCalledWith(
      expect.stringContaining("plan%20with%20spaces"),
    );
  });
});
