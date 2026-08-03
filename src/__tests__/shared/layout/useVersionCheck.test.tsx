import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVersionCheck } from "@/shared/layout/useVersionCheck";

// 轮询节奏常量（与实现保持同步）：首次延迟 20s，之后每 3 分钟
const INITIAL_DELAY_MS = 20 * 1000;
const CHECK_INTERVAL_MS = 3 * 60 * 1000;

describe("useVersionCheck", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let reloadMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    reloadMock = vi.fn();
    // jsdom 的 location.reload 无法直接 spy，整体替换 location 对象
    vi.stubGlobal("location", { ...window.location, reload: reloadMock });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const jsonResponse = (version: string) =>
    Promise.resolve({ json: () => Promise.resolve({ version }) } as Response);

  it("records initial version and does not reload on first poll with same version", async () => {
    fetchMock.mockImplementation(() => jsonResponse("1.0.0"));
    const { unmount } = renderHook(() => useVersionCheck());

    // 初始版本拉取（挂载即触发）
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/system/version");
    expect(fetchMock.mock.calls[0][1]).toEqual({ cache: "no-store" });

    // 首次延迟后轮询：版本一致 → 不刷新
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(reloadMock).not.toHaveBeenCalled();
    unmount();
  });

  it("reloads silently when server reports a new version", async () => {
    // 首次 1.0.0，轮询时已部署 1.0.1
    fetchMock
      .mockImplementationOnce(() => jsonResponse("1.0.0"))
      .mockImplementation(() => jsonResponse("1.0.1"));
    const { unmount } = renderHook(() => useVersionCheck());

    await vi.advanceTimersByTimeAsync(0); // 初始版本落位
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS); // 首次轮询
    expect(reloadMock).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("keeps polling at fixed interval after the first check", async () => {
    fetchMock.mockImplementation(() => jsonResponse("1.0.0"));
    const { unmount } = renderHook(() => useVersionCheck());

    await vi.advanceTimersByTimeAsync(0); // 初始
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS); // 第 1 次轮询
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS); // 第 2 次轮询
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(reloadMock).not.toHaveBeenCalled();
    unmount();
  });

  it("tolerates fetch failures without crashing or reloading", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error("offline")));
    const { unmount } = renderHook(() => useVersionCheck());

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS);
    expect(reloadMock).not.toHaveBeenCalled();
    unmount();
  });

  it("never reloads when initial version was never recorded", async () => {
    // 初始请求失败 → initialVersion 为空串 → 后续任何版本差异都不触发刷新
    fetchMock
      .mockImplementationOnce(() => Promise.reject(new Error("boot offline")))
      .mockImplementation(() => jsonResponse("9.9.9"));
    const { unmount } = renderHook(() => useVersionCheck());

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS);
    expect(reloadMock).not.toHaveBeenCalled();
    unmount();
  });

  it("clears timers on unmount", async () => {
    fetchMock.mockImplementation(() => jsonResponse("1.0.0"));
    const { unmount } = renderHook(() => useVersionCheck());
    await vi.advanceTimersByTimeAsync(0);
    unmount();

    await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS + CHECK_INTERVAL_MS * 2);
    // 卸载后不再有新的版本请求
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
