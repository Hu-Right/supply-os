/**
 * useHasDiagnosis 单元测试
 *
 * @module tests/unit/shared/hooks/useHasDiagnosis
 * @description 诊断引导卡的数据源 Hook：
 *              1. 无 userId/supplierId → 不取数、loading=false；
 *              2. mine 列表按 supplierId 命中 → hasDiagnosis=true；
 *              3. 未命中 → false；
 *              4. diagnosis-changed / enterprise-changed 事件触发重取（提交诊断后卡片退场的关键）；
 *              5. 取数失败暴露 error，loading 结束。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const { apiMock, handlers } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  handlers: new Map<string, Set<() => void>>(),
}));

vi.mock("@/core/http", () => ({ api: apiMock }));
vi.mock("@/core/events", () => ({
  onAppEvent: (name: string, cb: () => void) => {
    const set = handlers.get(name) ?? new Set<() => void>();
    set.add(cb);
    handlers.set(name, set);
    return () => set.delete(cb);
  },
}));

import { useHasDiagnosis } from "@/shared/hooks/useHasDiagnosis";

beforeEach(() => {
  apiMock.mockReset();
  handlers.clear();
});

describe("useHasDiagnosis", () => {
  it("无 userId/supplierId 时不请求，loading 直接结束", () => {
    const { result } = renderHook(() => useHasDiagnosis(undefined, undefined));
    expect(result.current.loading).toBe(false);
    expect(result.current.hasDiagnosis).toBe(false);
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("mine 列表命中当前 supplierId → hasDiagnosis=true", async () => {
    apiMock.mockResolvedValue({ list: [{ supplierId: 123 }, { supplierId: 456 }] });
    const { result } = renderHook(() => useHasDiagnosis(7, 123));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasDiagnosis).toBe(true);
    expect(apiMock).toHaveBeenCalledWith("/api/supplier-diagnosis/mine");
  });

  it("mine 列表没有当前 supplierId → hasDiagnosis=false", async () => {
    apiMock.mockResolvedValue({ list: [{ supplierId: 999 }] });
    const { result } = renderHook(() => useHasDiagnosis(7, 123));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasDiagnosis).toBe(false);
  });

  it("diagnosis-changed 事件触发重取（提交后卡片即时退场）", async () => {
    apiMock
      .mockResolvedValueOnce({ list: [{ supplierId: 123 }] })
      .mockResolvedValueOnce({ list: [] });
    const { result } = renderHook(() => useHasDiagnosis(7, 123));
    await waitFor(() => expect(result.current.hasDiagnosis).toBe(true));

    for (const cb of handlers.get("supply-os:diagnosis-changed") ?? []) cb();
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.hasDiagnosis).toBe(false));
  });

  it("取数失败暴露 error 且结束 loading", async () => {
    apiMock.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useHasDiagnosis(7, 123));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("network");
    expect(result.current.hasDiagnosis).toBe(false);
  });
});
