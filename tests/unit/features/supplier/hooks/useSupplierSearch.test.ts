/**
 * useSupplierSearch — 列表取数测试
 * @module tests/unit/features/supplier/hooks/useSupplierSearch.test.ts
 * @description 2026-10-12 行业改级联下拉后，本 hook 只负责列表：钉三条——
 *              1. 产品/公司关键词防抖 300ms：连打只多一次请求，且带最后一次输入；
 *              2. 行业码原样透传成 industry_code（任一层级码，repo 按子树前缀筛），且不再发 industry_q；
 *              3. 行业选项（facet/子级）不在此装载——挂载时不得打 /api/industries/facets。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSupplierSearch } from "@/features/supplier/hooks/useSupplierSearch";

const mockApi = vi.fn();
vi.mock("@/core/http", () => ({
  api: (...args: unknown[]) => mockApi(...args),
}));

const pageResult = { items: [], total: 0, page: 1, pageSize: 8 };

afterEach(() => {
  mockApi.mockReset();
  vi.restoreAllMocks();
});

describe("useSupplierSearch — 列表取数", () => {
  it("挂载只发列表请求，不再拉行业 facet（facet 已移交 useIndustryCascade）", async () => {
    mockApi.mockResolvedValue(pageResult);
    const { result } = renderHook(() => useSupplierSearch({ locale: "zh", searchTerm: "" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const urls = mockApi.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.startsWith("/api/industries/facets"))).toBe(false);
    expect(urls.every((u) => u.startsWith("/api/suppliers"))).toBe(true);
  });

  it("行业码原样透传成 industry_code，且不带 industry_q", async () => {
    mockApi.mockResolvedValue(pageResult);
    const { result } = renderHook(() =>
      useSupplierSearch({ locale: "zh", searchTerm: "", supplierIndustryCode: "UGT-I-0326" }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const url = String(mockApi.mock.calls[mockApi.mock.calls.length - 1][0]);
    expect(url).toContain("industry_code=UGT-I-0326");
    expect(url).not.toContain("industry_q");
  });

  it("关键词防抖：连打三个字符只多一次列表请求，且用的是最后一次输入", async () => {
    mockApi.mockResolvedValue(pageResult);
    const { result, rerender } = renderHook(
      ({ term }: { term: string }) => useSupplierSearch({ locale: "zh", searchTerm: term }),
      { initialProps: { term: "" } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = mockApi.mock.calls.length;

    rerender({ term: "L" });
    rerender({ term: "LE" });
    rerender({ term: "LED" });
    // 防抖窗口内不得抢跑（每个字符一次请求就是把 QPS 乘以字长）
    expect(mockApi.mock.calls.length).toBe(before);

    await waitFor(() => expect(mockApi.mock.calls.length).toBe(before + 1), { timeout: 2000 });
    const lastUrl = String(mockApi.mock.calls[mockApi.mock.calls.length - 1][0]);
    expect(lastUrl).toContain("q=LED");
    expect(lastUrl).not.toContain("q=L&");
    expect(lastUrl).not.toContain("q=LE&");
  });
});
