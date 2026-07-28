import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useCrmData } from "@/features/crm/hooks/useCrmData";
import { server } from "@/__tests__/mocks/server";
import { http, HttpResponse } from "msw";

// ── Mock useLocale ──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

// ── Mock useAuth ──
vi.mock("@/core/auth", () => ({
  useAuth: () => ({ authUser: { email: "ops@example.com" } }),
}));

// ── Mock useAiMatch ──
const mockTriggerMatch = vi.fn();
const mockSetSelectedSupplier = vi.fn();
const mockSetSelectedOpportunity = vi.fn();

vi.mock("@/features/crm/hooks/useAiMatch", () => ({
  useAiMatch: () => ({
    report: "",
    isMatching: false,
    selectedSupplier: null,
    selectedOpportunity: null,
    setSelectedSupplier: mockSetSelectedSupplier,
    setSelectedOpportunity: mockSetSelectedOpportunity,
    triggerMatch: mockTriggerMatch,
  }),
}));

// ── Mock @/data（静态 SUPPLIERS 已移除，仅剩商机基准）──
vi.mock("@/data", () => ({
  OPPORTUNITIES: [
    { id: "opp-1", titleZh: "联合国采购", titleEn: "UN Procurement", region: "asia", deadline: "2026-12-31" },
  ],
}));

describe("useCrmData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes with empty state", async () => {
    const { result } = renderHook(() => useCrmData());
    // Initially leads is empty
    expect(result.current.leads).toEqual([]);
    expect(result.current.aiReport).toBe("");
    expect(result.current.subscribingOppMessage).toBeNull();
    // Wait for loading to complete
    await waitFor(() => {
      expect(result.current.isLoadingLeads).toBe(false);
    });
  });

  it("fetches leads and DB suppliers on mount", async () => {
    const mockLeads = [{ id: "lead-1", name: "Test Lead" }];
    const mockDbSuppliers = [
      { id: "sup-db-72", nameZh: "深圳安博深科技有限公司", nameEn: "深圳安博深科技有限公司", type: "domestic" },
      { id: "sup-db-71", nameZh: "杭州绿能装备股份有限公司", nameEn: "杭州绿能装备股份有限公司", type: "domestic" },
    ];

    server.use(
      http.get("/api/leads", () => HttpResponse.json(mockLeads)),
      http.get("/api/suppliers", () => HttpResponse.json(mockDbSuppliers))
    );

    const { result } = renderHook(() => useCrmData());

    await waitFor(() => {
      expect(result.current.isLoadingLeads).toBe(false);
    });

    expect(result.current.leads).toEqual(mockLeads);
    // 列表 = 纯 DB 拉取结果（不再拼接静态数据）
    expect(result.current.totalSuppliersList.length).toBe(2);
  });

  it("handles fetch failure gracefully", async () => {
    server.use(
      http.get("/api/leads", () => new HttpResponse(null, { status: 500 })),
      http.get("/api/suppliers", () => new HttpResponse(null, { status: 500 }))
    );

    const { result } = renderHook(() => useCrmData());

    await waitFor(() => {
      expect(result.current.isLoadingLeads).toBe(false);
    });

    expect(result.current.leads).toEqual([]);
    expect(result.current.totalSuppliersList.length).toBe(0); // 无静态兜底
  });

  it("sets default AI selections (first fetched supplier + first opportunity)", async () => {
    const mockDbSuppliers = [
      { id: "sup-db-72", nameZh: "深圳安博深科技有限公司", nameEn: "深圳安博深科技有限公司", type: "domestic" },
    ];
    server.use(http.get("/api/suppliers", () => HttpResponse.json(mockDbSuppliers)));

    renderHook(() => useCrmData());

    await waitFor(() => {
      expect(mockSetSelectedSupplier).toHaveBeenCalledWith(
        expect.objectContaining({ id: "sup-db-72" })
      );
      expect(mockSetSelectedOpportunity).toHaveBeenCalled();
    });
    expect(mockTriggerMatch).not.toHaveBeenCalled();
  });

  it("does not preselect a supplier when the fetched list is empty", async () => {
    server.use(http.get("/api/suppliers", () => HttpResponse.json([])));

    const { result } = renderHook(() => useCrmData());

    await waitFor(() => {
      expect(result.current.isLoadingLeads).toBe(false);
    });
    expect(mockSetSelectedSupplier).not.toHaveBeenCalled();
  });

  it("selects incoming supplier and auto-triggers match when autoMatchSupplier provided", async () => {
    const incoming = { id: "sup-x", nameZh: "跨页供应商", nameEn: "Cross X" } as any;
    renderHook(() => useCrmData({ autoMatchSupplier: incoming }));

    await waitFor(() => {
      expect(mockSetSelectedSupplier).toHaveBeenCalledWith(incoming);
      // 自动撮合：目标供应商 + 默认首条商机
      expect(mockTriggerMatch).toHaveBeenCalledWith(
        incoming,
        expect.objectContaining({ id: "opp-1" }),
      );
    });
  });

  it("triggerAiMatchmaking alerts when no selection", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const { result } = renderHook(() => useCrmData());

    await act(async () => {
      await result.current.triggerAiMatchmaking();
    });

    expect(alertSpy).toHaveBeenCalled();
    expect(mockTriggerMatch).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("subscribeOpportunity sets message then clears it", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCrmData());

    act(() => {
      result.current.subscribeOpportunity();
    });

    expect(result.current.subscribingOppMessage).toBe("subscribeOppSuccess");

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(result.current.subscribingOppMessage).toBeNull();
    vi.useRealTimers();
  });
});
