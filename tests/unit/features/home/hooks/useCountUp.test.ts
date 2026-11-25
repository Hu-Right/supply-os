import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCountUp } from "@/shared/hooks/useCountUp";

describe("useCountUp", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("target=0 时返回 0", () => {
    const { result } = renderHook(() => useCountUp(0));
    expect(result.current).toBe(0);
  });

  it("target>0 首帧直接返回 target（服务端真实数字不被抹成 0）", () => {
    const { result } = renderHook(() => useCountUp(100, 1000));
    expect(result.current).toBe(100);

    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current).toBe(100);
  });

  it("duration 结束后稳定在 target", () => {
    const { result } = renderHook(() => useCountUp(42, 500));

    // 快进超过 duration
    act(() => { vi.advanceTimersByTime(600); });
    expect(result.current).toBe(42);
  });

  it("target 变更时重新动画到新目标", () => {
    const { result, rerender } = renderHook(
      ({ target }) => useCountUp(target, 1000),
      { initialProps: { target: 100 } },
    );

    act(() => { vi.advanceTimersByTime(1100); });
    expect(result.current).toBe(100);

    // 变更 target — 从当前显示值 100 缓动到 200，不回到 0
    rerender({ target: 200 });
    act(() => { vi.advanceTimersByTime(20); });
    expect(result.current).toBeGreaterThanOrEqual(100);
    expect(result.current).toBeLessThan(200);

    act(() => { vi.advanceTimersByTime(1100); });
    expect(result.current).toBe(200);
  });
});
