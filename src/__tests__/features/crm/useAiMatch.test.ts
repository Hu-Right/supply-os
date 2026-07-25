import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAiMatch } from "@/features/crm/hooks/useAiMatch";

// Mock useLocale
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

const mockSupplier = {
  id: "s1",
  nameZh: "测试供应商",
  nameEn: "Test Supplier",
  type: "domestic" as const,
  industryZh: "电子",
  industryEn: "Electronics",
  region: "Asia",
  country: "China",
  contactPerson: "张三",
  contactEmail: "test@example.com",
  contactPhone: "123456",
  ungmCode: "",
};

const mockOpportunity = {
  id: "o1",
  titleZh: "测试标讯",
  titleEn: "Test Opportunity",
  descriptionZh: "描述",
  descriptionEn: "Description",
  industryZh: "电子",
  industryEn: "Electronics",
  budget: "$100,000",
  deadline: "2026-12-31",
};

describe("useAiMatch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes with default values", () => {
    const { result } = renderHook(() => useAiMatch());

    expect(result.current.report).toBe("");
    expect(result.current.isMatching).toBe(false);
    expect(result.current.selectedSupplier).toBeNull();
    expect(result.current.selectedOpportunity).toBeNull();
  });

  it("sets selected supplier and opportunity", () => {
    const { result } = renderHook(() => useAiMatch());

    act(() => {
      result.current.setSelectedSupplier(mockSupplier as any);
    });
    expect(result.current.selectedSupplier).toEqual(mockSupplier);

    act(() => {
      result.current.setSelectedOpportunity(mockOpportunity as any);
    });
    expect(result.current.selectedOpportunity).toEqual(mockOpportunity);
  });

  it("sets report on successful match", async () => {
    const mockResponse = { analysis: "匹配度 85%" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const { result } = renderHook(() => useAiMatch());

    await act(async () => {
      await result.current.triggerMatch(mockSupplier as any, mockOpportunity as any);
    });

    expect(result.current.report).toBe("匹配度 85%");
    expect(result.current.isMatching).toBe(false);
  });

  it("sets error message on HTTP failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    const { result } = renderHook(() => useAiMatch());

    await act(async () => {
      await result.current.triggerMatch(mockSupplier as any, mockOpportunity as any);
    });

    expect(result.current.report).toBe("aiMatchHttpError");
    expect(result.current.isMatching).toBe(false);
  });

  it("sets error message on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useAiMatch());

    await act(async () => {
      await result.current.triggerMatch(mockSupplier as any, mockOpportunity as any);
    });

    expect(result.current.report).toBe("aiMatchNetworkError");
    expect(result.current.isMatching).toBe(false);
  });
});
