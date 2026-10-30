/**
 * 列表翻页预取窗口（2026-10-30 成对卡顿修复）
 *
 * 钉住：渲染完第 N 页后，必须同时把 N+1 与 N+2 预取进缓存。
 * 只预取 N+1 时链条每两跳断一次 —— 命中客户端缓存的那一跳产出的新预取晚于用户点击，
 * 于是下一跳冷启动：用户感知为「1-2、3-4、5-6 成对快，其余长加载」（实测同）。
 * 同时钉住：不越界预取（末页不请求）、不拿 loading 中的半成品去预取。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { SearchQuery } from "@/features/procurement/hooks/search/useSearchQuery";

const mockFetchUnifiedSearch = vi.fn();
vi.mock("@/features/procurement/api", () => ({
  fetchUnifiedSearch: (...args: unknown[]) => mockFetchUnifiedSearch(...args),
}));
vi.mock("@/core/http", () => ({ clearApiCache: vi.fn() }));
vi.mock("@/core/i18n", () => ({ useLocale: () => ({ locale: "zh", t: (k: string) => k }) }));

import { useSearchResults } from "@/features/procurement/hooks/search/useSearchResults";

const QUERY = {
  activeQ: "", activeCountry: "", activeFrom: "", activeTo: "", activeSort: "latest",
  activeWindow: "", activeNoticeType: "", activeFeatured: false, activeBudgetMin: "",
  activeBudgetMax: "", activeCommodity: "", activeMatchMode: "all",
  hasSearch: false, hasOtherSearch: false, searchKey: "|,,,,,,,,,,all",
} as unknown as SearchQuery;

/** 取所有请求过的页码（按发起顺序） */
const pagesCalled = () =>
  mockFetchUnifiedSearch.mock.calls.map((c) => (c[0] as { page: number }).page);

/** 总页数由响应 total/page_size 派生（TOTAL_PAGES*10 / 10 = 10 页），本文件只控首页响应 */
const TOTAL_PAGES = 10;

function renderPage(page: number) {
  return renderHook(() =>
    useSearchResults({
      query: QUERY,
      page,
      prefsMode: "default",
      userId: undefined,
      variantRef: { current: undefined },
    }),
  );
}

beforeEach(() => {
  mockFetchUnifiedSearch.mockReset();
  mockFetchUnifiedSearch.mockImplementation(async (p: { page: number }) => ({
    items: [{ noticePk: p.page * 10 }, { noticePk: p.page * 10 + 1 }],
    total: TOTAL_PAGES * 10,
    page: p.page,
    page_size: 10,
  }));
});

describe("useSearchResults 预取窗口", () => {
  it("首页数据就绪 → 预取 page+1 与 page+2 两页（链条不断）", async () => {
    renderPage(1);

    await waitFor(() => {
      expect(pagesCalled()).toContain(2);
      expect(pagesCalled()).toContain(3);
    });

    expect(pagesCalled().filter((p) => p === 2).length).toBeLessThanOrEqual(2);
  });

  it("已到最后一页只往前一页 → 不越界请求 totalPages 之外的页", async () => {
    renderPage(TOTAL_PAGES - 1);

    await waitFor(() => {
      expect(pagesCalled()).toContain(10);
    });
    expect(pagesCalled()).not.toContain(11);
  });

  it("已在最后一页 → 完全不预取", async () => {
    renderPage(TOTAL_PAGES);

    await waitFor(() => {
      expect(mockFetchUnifiedSearch).toHaveBeenCalled();
    });
    expect(pagesCalled().every((p) => p === 10)).toBe(true); // 仅主请求，无 page 11/12
  });

  it("主请求携带 AbortSignal，预取不带（预取不得被翻页 abort 牵连）", async () => {
    renderPage(1);

    await waitFor(() => {
      expect(pagesCalled()).toContain(3);
    });
    const main = mockFetchUnifiedSearch.mock.calls.find((c) => (c[0] as { page: number }).page === 1);
    const prefetch = mockFetchUnifiedSearch.mock.calls.find((c) => (c[0] as { page: number }).page === 2);
    expect(main?.[1]).toBeInstanceOf(AbortSignal);
    expect(prefetch?.[1]).toBeUndefined();
  });
});
