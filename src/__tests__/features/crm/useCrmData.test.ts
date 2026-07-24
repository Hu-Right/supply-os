import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useCrmData } from "@/features/crm/hooks/useCrmData";
import { server } from "@/__tests__/mocks/server";
import { http, HttpResponse } from "msw";

// ── Mock useLocale ──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
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

// ── Mock @/data ──
vi.mock("@/data", () => ({
  SUPPLIERS: [
    { id: "sup-1", nameZh: "供应商A", nameEn: "Supplier A", country: "CN", region: "asia" },
  ],
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

  it("fetches leads and custom suppliers on mount", async () => {
    const mockLeads = [{ id: "lead-1", name: "Test Lead" }];
    const mockCustomSuppliers = [{ id: "sup-c1", nameZh: "自定义供应商", nameEn: "Custom", country: "CN", region: "asia" }];

    server.use(
      http.get("/api/leads", () => HttpResponse.json(mockLeads)),
      http.get("/api/suppliers/custom", () => HttpResponse.json(mockCustomSuppliers))
    );

    const { result } = renderHook(() => useCrmData());

    await waitFor(() => {
      expect(result.current.isLoadingLeads).toBe(false);
    });

    expect(result.current.leads).toEqual(mockLeads);
    expect(result.current.totalSuppliersList.length).toBe(2); // 1 custom + 1 from SUPPLIERS
  });

  it("handles fetch failure gracefully", async () => {
    server.use(
      http.get("/api/leads", () => new HttpResponse(null, { status: 500 })),
      http.get("/api/suppliers/custom", () => new HttpResponse(null, { status: 500 }))
    );

    const { result } = renderHook(() => useCrmData());

    await waitFor(() => {
      expect(result.current.isLoadingLeads).toBe(false);
    });

    expect(result.current.leads).toEqual([]);
    expect(result.current.totalSuppliersList.length).toBe(1); // Only from SUPPLIERS
  });

  it("sets default AI selections from @/data on mount", async () => {
    renderHook(() => useCrmData());

    await waitFor(() => {
      expect(mockSetSelectedSupplier).toHaveBeenCalled();
      expect(mockSetSelectedOpportunity).toHaveBeenCalled();
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
