/**
 * src/features/training/hooks/useTrainingModals.ts 测试
 * 验证培训落地页弹窗状态管理 Hook
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTrainingModals } from "@/features/training/hooks/useTrainingModals";

// useAuth 已在 setup.ts 中全局 mock
describe("useTrainingModals", () => {
  it("初始状态：所有弹窗关闭", () => {
    const { result } = renderHook(() => useTrainingModals());
    expect(result.current.showRegisterForm).toBe(false);
    expect(result.current.showPaymentModal).toBe(false);
    expect(result.current.showWechatQR).toBe(false);
    expect(result.current.registrationId).toBeNull();
  });

  it("openRegisterForm → showRegisterForm=true", () => {
    const { result } = renderHook(() => useTrainingModals());
    act(() => result.current.openRegisterForm());
    expect(result.current.showRegisterForm).toBe(true);
  });

  it("closeRegisterForm → showRegisterForm=false", () => {
    const { result } = renderHook(() => useTrainingModals());
    act(() => result.current.openRegisterForm());
    act(() => result.current.closeRegisterForm());
    expect(result.current.showRegisterForm).toBe(false);
  });

  it("openWechatQR / closeWechatQR 切换状态", () => {
    const { result } = renderHook(() => useTrainingModals());
    act(() => result.current.openWechatQR());
    expect(result.current.showWechatQR).toBe(true);
    act(() => result.current.closeWechatQR());
    expect(result.current.showWechatQR).toBe(false);
  });

  it("closePaymentModal → showPaymentModal=false", () => {
    const { result } = renderHook(() => useTrainingModals());
    act(() => result.current.closePaymentModal());
    expect(result.current.showPaymentModal).toBe(false);
  });
});
