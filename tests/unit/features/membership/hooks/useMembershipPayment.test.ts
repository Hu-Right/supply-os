import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMembershipPayment } from "@/features/membership/hooks/useMembershipPayment";

// Mock @/core/auth
const mockAuthUser = vi.fn();
vi.mock("@/core/auth", () => ({
  useAuth: () => ({ authUser: mockAuthUser() }),
}));

// Mock @/core/events
const mockEmitAppEvent = vi.fn();
vi.mock("@/core/events", () => ({
  emitAppEvent: (...args: unknown[]) => mockEmitAppEvent(...args),
}));

// Mock features/membership/api
const mockFetchUpgradePreview = vi.fn();
vi.mock("@/features/membership/api", () => ({
  fetchUpgradePreview: (...args: unknown[]) => mockFetchUpgradePreview(...args),
}));

// Mock @/types — 无需 mock，仅类型导入

const mockPlan = {
  plan_code: "radar",
  name: "雷达版",
  price: "799",
  currency: "CNY",
} as unknown as import("@/types").MembershipPlan;

describe("useMembershipPayment", () => {
  beforeEach(() => {
    mockAuthUser.mockReset();
    mockEmitAppEvent.mockReset();
    mockFetchUpgradePreview.mockReset();
  });

  it("未登录时 buyPlan 触发 require-login", () => {
    mockAuthUser.mockReturnValue(null);
    const { result } = renderHook(() => useMembershipPayment());

    act(() => { result.current.buyPlan(mockPlan); });

    expect(mockEmitAppEvent).toHaveBeenCalledWith("supply-os:require-login");
    expect(mockEmitAppEvent).not.toHaveBeenCalledWith("supply-os:pay", expect.anything());
  });

  it("已登录时 buyPlan 触发 supply-os:pay 事件", () => {
    mockAuthUser.mockReturnValue({ id: "user1" });
    const { result } = renderHook(() => useMembershipPayment());

    act(() => { result.current.buyPlan(mockPlan); });

    expect(mockEmitAppEvent).toHaveBeenCalledWith("supply-os:pay", expect.objectContaining({
      code: "radar",
      name: "雷达版",
      price: 799,
      currency: "CNY",
    }));
  });

  it("带 noticeId 时 returnUrl 包含招标 ID", () => {
    mockAuthUser.mockReturnValue({ id: "user1" });
    const { result } = renderHook(() => useMembershipPayment({ noticeId: "42" }));

    act(() => { result.current.buyPlan(mockPlan); });

    expect(mockEmitAppEvent).toHaveBeenCalledWith("supply-os:pay", expect.objectContaining({
      noticeId: 42,
      returnUrl: expect.stringContaining("notice_id=42"),
    }));
  });

  it("未登录时 startUpgrade 触发 require-login", () => {
    mockAuthUser.mockReturnValue(null);
    const { result } = renderHook(() => useMembershipPayment());

    act(() => { result.current.startUpgrade(mockPlan); });

    expect(mockEmitAppEvent).toHaveBeenCalledWith("supply-os:require-login");
    expect(mockFetchUpgradePreview).not.toHaveBeenCalled();
  });

  it("startUpgrade 打开弹窗并拉取升级预览", async () => {
    mockAuthUser.mockReturnValue({ id: "user1" });
    mockFetchUpgradePreview.mockResolvedValueOnce({
      can_upgrade: true, price_difference: 500,
    });

    const { result } = renderHook(() => useMembershipPayment());

    await act(async () => { result.current.startUpgrade(mockPlan); });

    expect(result.current.upgradeModalOpen).toBe(true);
    expect(mockFetchUpgradePreview).toHaveBeenCalledWith("radar");

    // 等待 preview 加载完成
    await vi.waitFor(() => {
      expect(result.current.upgradeLoading).toBe(false);
    });
    expect(result.current.upgradePreview).toEqual({ can_upgrade: true, price_difference: 500 });
  });

  it("升级预览失败时使用兜底值", async () => {
    mockAuthUser.mockReturnValue({ id: "user1" });
    mockFetchUpgradePreview.mockRejectedValueOnce(new Error("fail"));

    const { result } = renderHook(() => useMembershipPayment());

    await act(async () => { result.current.startUpgrade(mockPlan); });

    await vi.waitFor(() => {
      expect(result.current.upgradeLoading).toBe(false);
    });

    expect(result.current.upgradePreview).toEqual(
      expect.objectContaining({ can_upgrade: false, reason: "PREVIEW_LOAD_FAILED" })
    );
  });

  it("closeUpgradeModal 关闭弹窗", async () => {
    mockAuthUser.mockReturnValue({ id: "user1" });
    mockFetchUpgradePreview.mockResolvedValueOnce({ can_upgrade: true, price_difference: 0 });

    const { result } = renderHook(() => useMembershipPayment());

    await act(async () => { result.current.startUpgrade(mockPlan); });
    expect(result.current.upgradeModalOpen).toBe(true);

    act(() => { result.current.closeUpgradeModal(); });
    expect(result.current.upgradeModalOpen).toBe(false);
  });
});
