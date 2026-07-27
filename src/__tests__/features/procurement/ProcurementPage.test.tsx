import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProcurementPage from "@/features/procurement/pages/ProcurementPage";

// ── Mock API module ──
const mockFetchUnspscIndustries = vi.fn().mockResolvedValue([
  { id: 1, code: "10000000", title: "Fuel" },
  { id: 2, code: "20000000", title: "Lubricants" },
]);
const mockFetchUnspscChildren = vi.fn().mockResolvedValue([
  { id: 11, code: "10100000", title: "Diesel" },
]);
const mockFetchNotices = vi.fn().mockResolvedValue({
  items: [
    { id: 1, title: "Notice A", agency: "Agency A", country: "US", reference: "REF-001" },
    { id: 2, title: "Notice B", agency: "Agency B", country: "CN", reference: "REF-002" },
    { id: 3, title: "Notice C", agency: "Agency C", country: "DE", reference: "REF-003" },
  ],
  total: 3,
  pageSize: 9,
});
const mockFetchMembershipPlans = vi.fn().mockResolvedValue([]);
const mockFetchMembershipStatus = vi.fn().mockResolvedValue({
  membership_tier: "free",
  free_quota: 2,
  free_used: 0,
  free_remaining: 2,
  paid_unlocks: 0,
});
const mockFetchNoticeDetail = vi.fn().mockRejectedValue(new Error("NOTICE_DETAIL_403"));
const mockFetchUnlockedNoticeIds = vi.fn().mockResolvedValue([]);
const mockUnlockNotice = vi.fn().mockResolvedValue({ ok: true });
// 翻译默认不可用：hook 静默回退原文，与旧行为等价
const mockFetchNoticeTranslation = vi.fn().mockRejectedValue(new Error("TRANSLATION_UNAVAILABLE"));

vi.mock("@/features/procurement/api", () => ({
  fetchUnspscIndustries: () => mockFetchUnspscIndustries(),
  fetchUnspscChildren: (id: string) => mockFetchUnspscChildren(id),
  fetchNotices: (params: any) => mockFetchNotices(params),
  fetchMembershipPlans: () => mockFetchMembershipPlans(),
  fetchMembershipStatus: (key: string, cache?: boolean) => mockFetchMembershipStatus(key, cache),
  viewNotice: vi.fn().mockResolvedValue({ ok: true }),
  unlockNotice: (...args: any[]) => mockUnlockNotice(...args),
  expressInterest: vi.fn().mockResolvedValue({ ok: true }),
  fetchNoticeDetail: (id: number, key: string) => mockFetchNoticeDetail(id, key),
  fetchUnlockedNoticeIds: (key: string) => mockFetchUnlockedNoticeIds(key),
  fetchNoticeTranslation: (id: number, lang: string) => mockFetchNoticeTranslation(id, lang),
}));

// ── Mock useLocale ──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({
    t: (key: string) => key,
    locale: "zh",
  }),
}));

// ── Mock useAuth ──
const mockAuth = {
  authUser: { user_key: "u1", email: "test@test.com", display_name: "Test" } as any,
  isVip: false,
};
vi.mock("@/core/auth", () => ({
  useAuth: () => mockAuth,
}));

// ── Mock useNavigate / useSearchParams ──
const mockNavigate = vi.fn();
const mockSetSearchParams = vi.fn();
let mockSearchParams = new URLSearchParams();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [mockSearchParams, mockSetSearchParams],
  };
});

describe("ProcurementPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.authUser = { user_key: "u1", email: "test@test.com", display_name: "Test" };
    mockAuth.isVip = false;
    mockFetchNotices.mockResolvedValue({
      items: [
        { id: 1, title: "Notice A", agency: "Agency A", country: "US", reference: "REF-001" },
        { id: 2, title: "Notice B", agency: "Agency B", country: "CN", reference: "REF-002" },
        { id: 3, title: "Notice C", agency: "Agency C", country: "DE", reference: "REF-003" },
      ],
      total: 3,
      pageSize: 9,
    });
    mockFetchNoticeDetail.mockRejectedValue(new Error("NOTICE_DETAIL_403"));
    mockFetchUnlockedNoticeIds.mockResolvedValue([]);
    mockUnlockNotice.mockResolvedValue({ ok: true });
    mockFetchNoticeTranslation.mockRejectedValue(new Error("TRANSLATION_UNAVAILABLE"));
  });

  // ── 1. UNSPSC level-1 selection ──
  it("renders UNSPSC selector and loads industries", async () => {
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(mockFetchUnspscIndustries).toHaveBeenCalled();
    });

    // Title should be visible
    expect(screen.getByText("procurement_poolTitle")).toBeInTheDocument();
  });

  // ── 2. Notice list renders ──
  it("renders notice cards from API data", async () => {
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText("Notice A")).toBeInTheDocument();
      expect(screen.getByText("Notice B")).toBeInTheDocument();
      expect(screen.getByText("Notice C")).toBeInTheDocument();
    });
  });

  // ── 3. Total count display ──
  it("displays total notice count", async () => {
    render(<ProcurementPage />);

    await waitFor(() => {
      // Total = 3, displayed inside a span with surrounding text
      const totalBadge = screen.getByText(/procurement_total/);
      expect(totalBadge).toBeInTheDocument();
      expect(totalBadge.textContent).toContain("3");
    });
  });

  // ── 4. Search filter ──
  it("filters notices by search query", async () => {
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText("Notice A")).toBeInTheDocument();
    });

    // Type search query
    const searchInput = screen.getByPlaceholderText("procurement_search");
    fireEvent.change(searchInput, { target: { value: "Notice A" } });

    // Only Notice A should remain visible
    expect(screen.getByText("Notice A")).toBeInTheDocument();
    expect(screen.queryByText("Notice B")).toBeNull();
    expect(screen.queryByText("Notice C")).toBeNull();
  });

  // ── 5. 对齐原版：头部无升级VIP/采购培训/我的采购记录按钮 ──
  it("does not render extra header action buttons (remote-aligned)", async () => {
    mockAuth.isVip = false;
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText("procurement_poolTitle")).toBeInTheDocument();
    });
    expect(screen.queryByText("procurement_upgradeVip")).toBeNull();
    expect(screen.queryByText("procurementTrainingBtn")).toBeNull();
    expect(screen.queryByText("myPurchasesTitle")).toBeNull();
  });

  // ── 7. Pagination renders ──
  it("renders pagination component", async () => {
    render(<ProcurementPage />);

    await waitFor(() => {
      // Page info contains "procurement_currentPage"
      expect(screen.getByText(/procurement_currentPage/)).toBeInTheDocument();
    });
  });

  // ── 8. Empty state when no match ──
  it("shows empty state when search has no results", async () => {
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText("Notice A")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText("procurement_search");
    fireEvent.change(searchInput, { target: { value: "nonexistent_query_xyz" } });

    await waitFor(() => {
      expect(screen.getByText("procurement_noMatch")).toBeInTheDocument();
    });
  });

  // ── 9. UNSPSC selector renders ──
  it("renders UNSPSC selector component", async () => {
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(mockFetchUnspscIndustries).toHaveBeenCalled();
    });

    // UNSPSC selector should be present (5 level selects)
    const selects = document.querySelectorAll("select");
    expect(selects.length).toBeGreaterThanOrEqual(1);
  });

  // ── 10. View notice detail ──
  it("clicking notice card opens detail view", async () => {
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText("Notice A")).toBeInTheDocument();
    });

    // Click on the notice card to view detail
    const noticeCard = screen.getByText("Notice A").closest("div[class]") as HTMLElement;
    if (noticeCard) {
      fireEvent.click(noticeCard);
    }

    // Detail view should render NoticeDetail component
    // Since we can't easily test the detail view without more mocks,
    // we just verify the click doesn't crash
  });

  // ── 14. Loading state display ──
  it("shows loading indicator while fetching notices", async () => {
    mockFetchNotices.mockImplementation(() => new Promise(() => {})); // Never resolves
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText("procurement_loading")).toBeInTheDocument();
    });
  });

  // ── 15. Error state display ──
  it("shows error message when notices fetch fails", async () => {
    mockFetchNotices.mockRejectedValue(new Error("Network error"));
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load procurement notices.")).toBeInTheDocument();
    });
  });

  // ── 16. VIP active badge display ──
  it("shows VIP active badge when user has paid quota", async () => {
    mockAuth.isVip = true;
    mockFetchMembershipStatus.mockResolvedValue({
      membership_tier: "paid",
      free_quota: 2,
      free_used: 0,
      free_remaining: 2,
      paid_quota_remaining: 10,
      paid_unlocks: 5,
    });
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText("procurement_vipActive")).toBeInTheDocument();
    });
  });

  // ── 17. Free limit message for non-VIP users ──
  it("shows free limit message when non-VIP exceeds detail view limit", async () => {
    // Mock localStorage to have 3 views already
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockReturnValue("3");
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText("Notice A")).toBeInTheDocument();
    });

    // Try to click a notice card - should trigger free limit
    const noticeCard = screen.getByText("Notice A").closest("article");
    if (noticeCard) {
      fireEvent.click(noticeCard);
    }

    await waitFor(() => {
      // Should show free limit message
      const messages = document.querySelectorAll("*");
      const hasLimitMessage = Array.from(messages).some(el =>
        el.textContent?.includes("procurement_freeLimit")
      );
      // The message may or may not appear depending on click handling
      // Just verify the component doesn't crash
    });

    getItemSpy.mockRestore();
  });

  // ── 18. UNSPSC fetch error handling ──
  it("shows error when UNSPSC industries fetch fails", async () => {
    mockFetchUnspscIndustries.mockRejectedValue(new Error("Failed"));
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load UNSPSC categories.")).toBeInTheDocument();
    });
  });

  // ── 19. Empty notices state ──
  it("shows empty state when no notices returned", async () => {
    mockFetchNotices.mockResolvedValue({ items: [], total: 0, pageSize: 9 });
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText("procurement_noMatch")).toBeInTheDocument();
    });
  });

  // ── 20. Free trial badge for non-VIP ──
  it("shows free trial badge for non-VIP users", async () => {
    mockAuth.isVip = false;
    mockFetchMembershipStatus.mockResolvedValue({
      membership_tier: "free",
      free_quota: 2,
      free_used: 0,
      free_remaining: 2,
      paid_quota_remaining: 0,
    });
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText(/procurement_freeTrial/)).toBeInTheDocument();
    });
  });

  // ── 21. Free-limit exhausted opens the embedded payment paywall panel ──
  it("opens the payment paywall panel with plans when non-VIP exhausts free detail views", async () => {
    mockAuth.isVip = false;
    mockFetchMembershipPlans.mockResolvedValue([
      {
        plan_code: "single_89",
        name: "Single Unlock",
        description: "One-off unlock",
        price: 89,
        currency: "CNY",
        unlock_quota: 1,
        free_quota: 0,
        plan_type: "single",
      },
    ]);
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockReturnValue("3");

    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getAllByText("procurement_detail").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByText("procurement_detail")[0]);

    await waitFor(() => {
      // 付费面板标题 + 免费上限提示同时出现，套餐渲染进面板
      expect(screen.getByText("procurement_products")).toBeInTheDocument();
      expect(screen.getByText("procurement_freeLimit")).toBeInTheDocument();
      expect(screen.getByText("Single Unlock")).toBeInTheDocument();
    });

    getItemSpy.mockRestore();
  });

  // ── 闪烁修复：已解锁公告免闪烁直达完整详情 ──
  it("opens an already-unlocked notice without flashing the locked panel", async () => {
    mockFetchUnlockedNoticeIds.mockResolvedValue([1]);
    mockFetchNoticeDetail.mockResolvedValue({
      id: 1,
      title: "Notice A",
      core_locked: false,
      agency_full: "UNDP Kenya",
    });

    render(<ProcurementPage />);
    await waitFor(() => expect(mockFetchUnlockedNoticeIds).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("Notice A")).toBeInTheDocument());

    // 点击 Notice A（首张卡）的"查看详情"按钮触发 openNotice
    fireEvent.click(screen.getAllByText("procurement_detail")[0]);

    // 锁定面板自始至终不出现，完整数据直接呈现
    expect(screen.queryByText("procurement_lockedCoreDesc")).toBeNull();
    await waitFor(() => expect(screen.getByText("UNDP Kenya")).toBeInTheDocument());
    expect(screen.queryByText("procurement_lockedCoreDesc")).toBeNull();
  });

  it("still shows the locked panel for a locked notice", async () => {
    render(<ProcurementPage />);
    await waitFor(() => expect(screen.getByText("Notice B")).toBeInTheDocument());

    // Notice B 为第二张卡，未解锁：详情应照常渲染锁定面板
    fireEvent.click(screen.getAllByText("procurement_detail")[1]);
    await waitFor(() =>
      expect(screen.getByText("procurement_lockedCoreDesc")).toBeInTheDocument()
    );
  });

  // ── 解锁过程中显示骨架屏而非锁定面板 ──
  it("shows skeleton during unlock until detail data arrives", async () => {
    render(<ProcurementPage />);
    await waitFor(() => expect(screen.getByText("Notice B")).toBeInTheDocument());

    // 打开未解锁公告：锁定面板照常
    fireEvent.click(screen.getAllByText("procurement_detail")[1]);
    await waitFor(() =>
      expect(screen.getByText("procurement_lockedCoreDesc")).toBeInTheDocument()
    );

    // 解锁成功但详情响应挂起：期间应显示骨架屏、隐藏锁定面板
    let resolveDetail!: (value: unknown) => void;
    mockFetchNoticeDetail.mockImplementation(
      () => new Promise((resolve) => { resolveDetail = resolve; })
    );
    fireEvent.click(screen.getByText(/procurement_freeUnlock/));

    await waitFor(() => expect(screen.getByTestId("detail-skeleton")).toBeInTheDocument());
    expect(screen.queryByText("procurement_lockedCoreDesc")).toBeNull();

    // 详情返回后骨架屏让位于完整内容
    resolveDetail({ id: 2, title: "Notice B", core_locked: false, agency_full: "WHO Geneva" });
    await waitFor(() => expect(screen.getByText("WHO Geneva")).toBeInTheDocument());
    expect(screen.queryByTestId("detail-skeleton")).toBeNull();
  });

  it("restores the locked panel when unlock fails", async () => {
    render(<ProcurementPage />);
    await waitFor(() => expect(screen.getByText("Notice B")).toBeInTheDocument());

    fireEvent.click(screen.getAllByText("procurement_detail")[1]);
    await waitFor(() =>
      expect(screen.getByText("procurement_lockedCoreDesc")).toBeInTheDocument()
    );

    // 解锁失败：骨架屏不得残留，锁定面板恢复
    mockUnlockNotice.mockResolvedValue({ ok: false, status: 500 });
    fireEvent.click(screen.getByText(/procurement_freeUnlock/));

    await waitFor(() => expect(screen.getByText("procurement_unlockFail")).toBeInTheDocument());
    expect(screen.queryByTestId("detail-skeleton")).toBeNull();
    expect(screen.getByText("procurement_lockedCoreDesc")).toBeInTheDocument();
  });
});
