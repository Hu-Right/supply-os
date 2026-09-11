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

  it("target>0 时从 0 开始递增", () => {
    const { result } = renderHook(() => useCountUp(100, 1000));
    // 初始值应为 0
    expect(result.current).toBe(0);

    // 快进 500ms（50% 进度）
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(100);
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

    // 变更 target — useEffect 重新执行，setCount(0) + 新动画启动
    rerender({ target: 200 });
    // 推进一帧让 setCount(0) 生效
    act(() => { vi.advanceTimersByTime(20); });
    // 新动画已开始，值应远小于 200
    expect(result.current).toBeLessThan(200);

    act(() => { vi.advanceTimersByTime(1100); });
    expect(result.current).toBe(200);
  });
});
