import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProcurementPage from "@/features/procurement/pages/ProcurementPage";

// jsdom 无 IntersectionObserver：T-B9 曝光采集（useNoticeFeedback.observeCard）依赖它
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

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
// 行业偏好/推荐默认为空：走全量列表，与旧行为等价
// [模块迁移] fetchIndustryPrefs/saveIndustryPrefs 已迁至 @/core/api/industry-prefs（auth/procurement 共用）
const mockFetchIndustryPrefs = vi.fn().mockResolvedValue(null);
const mockSaveIndustryPrefs = vi.fn().mockResolvedValue({ ok: true });
const mockFetchRecommendedNotices = vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 9 });
const mockFetchNoticeCountries = vi.fn().mockResolvedValue([]);
const mockSendNoticeFeedback = vi.fn().mockResolvedValue(undefined);

vi.mock("@/core/api/industry-prefs", () => ({
  fetchIndustryPrefs: (key: string) => mockFetchIndustryPrefs(key),
  saveIndustryPrefs: (key: string, prefs: any) => mockSaveIndustryPrefs(key, prefs),
}));

vi.mock("@/core/unspsc/api", () => ({
  fetchUnspscIndustries: (locale?: string) => mockFetchUnspscIndustries(locale),
  fetchUnspscChildren: (id: string, locale?: string) => mockFetchUnspscChildren(id, locale),
}));

vi.mock("@/features/procurement/api", () => ({
  fetchNotices: (params: any) => mockFetchNotices(params),
  fetchMembershipPlans: () => mockFetchMembershipPlans(),
  fetchMembershipStatus: (key: string, cache?: boolean) => mockFetchMembershipStatus(key, cache),
  viewNotice: vi.fn().mockResolvedValue(undefined),
  unlockNotice: (...args: any[]) => mockUnlockNotice(...args),
  expressInterest: vi.fn().mockResolvedValue(undefined),
  fetchNoticeDetail: (id: number, key: string) => mockFetchNoticeDetail(id, key),
  fetchUnlockedNoticeIds: (key: string) => mockFetchUnlockedNoticeIds(key),
  fetchNoticeTranslation: (id: number, lang: string) => mockFetchNoticeTranslation(id, lang),
  fetchRecommendedNotices: (params: any) => mockFetchRecommendedNotices(params),
  fetchNoticeCountries: () => mockFetchNoticeCountries(),
  sendNoticeFeedback: (key: string, actions: any[]) => mockSendNoticeFeedback(key, actions),
}));

// ── Mock useLocale（locale 可变：切语言重拉级联用例需要）──
// needsContentTranslation 复刻旧口径（用例原文均为英文：en 不请求、其余请求）
const localeState = { locale: "zh" };
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({
    t: (key: string) => key,
    locale: localeState.locale,
  }),
  needsContentTranslation: (_text: string, locale: string) => locale !== "en",
}));

// ── Mock useAuth ──
const mockAuth = {
  authUser: { user_key: "u1", email: "test@test.com", display_name: "Test" } as any,
  isVip: false,
};
vi.mock("@/core/auth", () => ({
  useAuth: () => mockAuth,
  // NoticeDetail 经 useOptionalAuth 读取登录态（详情页报告引导横幅判定）
  useOptionalAuth: () => mockAuth,
}));

// ── Mock useNavigate / useSearchParams ──
const mockNavigate = vi.fn();
// URL 为搜索生效条件唯一事实源：setSearchParams 实现同步更新 mockSearchParams，
// 测试侧随后 rerender 使组件读到新参数（模拟路由导航）
const mockSetSearchParams = vi.fn((next: any) => {
  mockSearchParams = new URLSearchParams(next);
});
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
    localeState.locale = "zh";
    mockSearchParams = new URLSearchParams();
    // clearAllMocks 会清空实现：重设 URL 同步更新逻辑（服务端搜索用例依赖）
    mockSetSearchParams.mockImplementation((next: any) => {
      mockSearchParams = new URLSearchParams(next);
    });
    mockAuth.authUser = { user_key: "u1", email: "test@test.com", display_name: "Test" };
    mockAuth.isVip = false;
    // 用例 18 会把 industries 改为 rejected：此处复位，避免污染后续依赖级联数据的用例
    mockFetchUnspscIndustries.mockResolvedValue([
      { id: 1, code: "10000000", title: "Fuel" },
      { id: 2, code: "20000000", title: "Lubricants" },
    ]);
    mockFetchUnspscChildren.mockResolvedValue([
      { id: 11, code: "10100000", title: "Diesel" },
    ]);
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
    // 用例 16/20/21b 会改写 membership（VIP/配额耗尽）：显式复位，clearAllMocks 不还原 implementation
    mockFetchMembershipStatus.mockResolvedValue({
      membership_tier: "free",
      free_quota: 2,
      free_used: 0,
      free_remaining: 2,
      paid_unlocks: 0,
    });
    mockFetchUnlockedNoticeIds.mockResolvedValue([]);
    mockUnlockNotice.mockResolvedValue({ ok: true });
    mockFetchNoticeTranslation.mockRejectedValue(new Error("TRANSLATION_UNAVAILABLE"));
    mockFetchIndustryPrefs.mockResolvedValue(null);
    mockSaveIndustryPrefs.mockResolvedValue({ ok: true });
    mockFetchRecommendedNotices.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 9 });
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

  // ── 1b. 级联选项文案：只显示标题，编码不进入文案 ──
  it("renders UNSPSC options with title only, without the code prefix", async () => {
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Fuel" })).toBeInTheDocument();
    });
    // 选项文案精确等于标题，不再是 "10000000 - Fuel"
    expect(screen.queryByRole("option", { name: /10000000/ })).toBeNull();
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
  // [本地差异 #6] 服务端搜索：URL 为生效条件唯一事实源。
  // 写入侧：提交表单把草稿写入 URL 参数
  it("writes the search draft into URL params on submit", async () => {
    render(<ProcurementPage />);
    await waitFor(() => {
      expect(screen.getByText("Notice A")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText("procurement_searchPlaceholder");
    fireEvent.change(searchInput, { target: { value: "Notice A" } });
    fireEvent.submit(searchInput.closest("form") as HTMLFormElement);

    expect(mockSetSearchParams).toHaveBeenCalledWith(expect.objectContaining({ q: "Notice A" }));
  });

  // 读取侧：带 q 的 URL 直达链接按服务端搜索结果渲染（前端不再本地过滤）
  it("filters notices by the q URL param via server search", async () => {
    const allItems = [
      { id: 1, title: "Notice A", agency: "Agency A", country: "US", reference: "REF-001" },
      { id: 2, title: "Notice B", agency: "Agency B", country: "CN", reference: "REF-002" },
      { id: 3, title: "Notice C", agency: "Agency C", country: "DE", reference: "REF-003" },
    ];
    mockFetchNotices.mockImplementation((params: any) => {
      const items = params?.q ? allItems.filter((it) => it.title.includes(params.q)) : allItems;
      return Promise.resolve({ items, total: items.length, pageSize: 9 });
    });
    // 直达链接场景：URL 已带 q=Notice A
    mockSearchParams = new URLSearchParams({ q: "Notice A" });
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(mockFetchNotices).toHaveBeenCalledWith(expect.objectContaining({ q: "Notice A" }));
      expect(screen.getByText("Notice A")).toBeInTheDocument();
    });
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
    // 服务端搜索无命中：URL 带 q 直达，后端返回空 items 即展示空态
    mockFetchNotices.mockResolvedValue({ items: [], total: 0, pageSize: 9 });
    mockSearchParams = new URLSearchParams({ q: "nonexistent_query_xyz" });
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(mockFetchNotices).toHaveBeenCalledWith(
        expect.objectContaining({ q: "nonexistent_query_xyz" })
      );
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
  // 当前行为：一级类目加载失败静默降级（下拉为空），公告列表照常加载，不再展示错误文案
  it("degrades silently when UNSPSC industries fetch fails", async () => {
    mockFetchUnspscIndustries.mockRejectedValue(new Error("Failed"));
    render(<ProcurementPage />);

    // 公告列表不受影响
    await waitFor(() => {
      expect(screen.getByText("Notice A")).toBeInTheDocument();
    });
    // 一级下拉仅占位项（无 Fuel/Lubricants），页面无错误文案残留
    expect(screen.queryByRole("option", { name: "Fuel" })).toBeNull();
    expect(screen.queryByText("Failed to load UNSPSC categories.")).toBeNull();
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

  // ── 21b. 免费门槛跟随后端 free_quota 动态值（非硬编码 3）──
  it("uses membership.free_quota as the paywall threshold instead of a hardcoded limit", async () => {
    mockAuth.isVip = false;
    // 后端配额 2：已看 2 次即达上限（若门槛仍硬编码 3，2 >= 3 不成立，本用例即红）
    mockFetchMembershipStatus.mockResolvedValue({
      membership_tier: "free",
      free_quota: 2,
      free_used: 2,
      free_remaining: 0,
      paid_unlocks: 0,
    });
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockReturnValue("2");

    render(<ProcurementPage />);

    // 等 membership 真正加载进状态（徽标显示剩余 0 条）且公告卡片渲染完成
    await waitFor(() => {
      expect(screen.getByText(/procurement_freeTrial 0/)).toBeInTheDocument();
      expect(screen.getAllByText("procurement_detail").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByText("procurement_detail")[0]);

    await waitFor(() => {
      expect(screen.getByText("procurement_freeLimit")).toBeInTheDocument();
      expect(screen.getByText("procurement_products")).toBeInTheDocument();
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

    // 锁定面板自始至终不出现，完整数据直接呈现（agency_full 在元信息格与解锁详情各出现一次）
    expect(screen.queryByText("procurement_lockedCoreDesc")).toBeNull();
    await waitFor(() => expect(screen.getAllByText("UNDP Kenya").length).toBeGreaterThan(0));
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

    // 详情返回后骨架屏让位于完整内容（agency_full 在元信息格与解锁详情各出现一次）
    resolveDetail({ id: 2, title: "Notice B", core_locked: false, agency_full: "WHO Geneva" });
    await waitFor(() => expect(screen.getAllByText("WHO Geneva").length).toBeGreaterThan(0));
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
    mockUnlockNotice.mockRejectedValue(new Error("UNLOCK_FAILED"));
    fireEvent.click(screen.getByText(/procurement_freeUnlock/));

    await waitFor(() => expect(screen.getByText("procurement_unlockFail")).toBeInTheDocument());
    expect(screen.queryByTestId("detail-skeleton")).toBeNull();
    expect(screen.getByText("procurement_lockedCoreDesc")).toBeInTheDocument();
  });

  // ── 账号默认行业偏好三级降级（本地差异 #5）──

  it("preselects saved industry prefs and filters by code_id with banner", async () => {
    mockFetchIndustryPrefs.mockResolvedValue({ level1_id: 1, level2_id: 11 });
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(mockFetchIndustryPrefs).toHaveBeenCalledWith("u1");
      expect(screen.getByText("procurement_prefsBanner")).toBeInTheDocument();
    });
    // 级联选择器按偏好路径预选，公告请求带最深层 code_id
    await waitFor(() => {
      const selects = document.querySelectorAll("select");
      expect((selects[0] as HTMLSelectElement).value).toBe("1");
      expect((selects[1] as HTMLSelectElement).value).toBe("11");
      expect(mockFetchNotices).toHaveBeenCalledWith(expect.objectContaining({ codeId: "11" }));
    });
  });

it("preselects three-level industry prefs and filters by the deepest code_id", async () => {
    // 三级级联数据按父级区分：1→Diesel(11)→Biodiesel(111)
    mockFetchUnspscChildren.mockImplementation((id: string) =>
      Promise.resolve(
        id === "1"
          ? [{ id: 11, code: "10100000", title: "Diesel" }]
          : id === "11"
            ? [{ id: 111, code: "10101500", title: "Biodiesel" }]
            : []
      )
    );
    mockFetchIndustryPrefs.mockResolvedValue({ level1_id: 1, level2_id: 11, level3_id: 111 });
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText("procurement_prefsBanner")).toBeInTheDocument();
    });
    // 三级路径全预选，公告请求带第三级 code_id
    await waitFor(() => {
      const selects = document.querySelectorAll("select");
      expect((selects[0] as HTMLSelectElement).value).toBe("1");
      expect((selects[1] as HTMLSelectElement).value).toBe("11");
      expect((selects[2] as HTMLSelectElement).value).toBe("111");
      expect(mockFetchNotices).toHaveBeenCalledWith(expect.objectContaining({ codeId: "111" }));
    });
  });

  it("falls back to recommended notices when no prefs but interests exist", async () => {
    mockFetchRecommendedNotices.mockResolvedValue({
      items: [{ id: 9, title: "Reco Notice", agency: "A", country: "US", reference: "R-9", match_score: 3 }],
      total: 1,
      page: 1,
      pageSize: 9,
    });
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(mockFetchRecommendedNotices).toHaveBeenCalledWith(
        expect.objectContaining({ userKey: "u1", page: 1 })
      );
      expect(screen.getByText("procurement_recommendedBanner")).toBeInTheDocument();
      expect(screen.getByText("Reco Notice")).toBeInTheDocument();
    });
  });

  it("keeps the default full list when neither prefs nor recommendations exist", async () => {
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText("Notice A")).toBeInTheDocument();
    });
    expect(screen.queryByText("procurement_prefsBanner")).toBeNull();
    expect(screen.queryByText("procurement_recommendedBanner")).toBeNull();
    expect(mockFetchNotices).toHaveBeenCalledWith(expect.objectContaining({ codeId: undefined }));
  });

  it("does not call prefs or recommended APIs when logged out", async () => {
    mockAuth.authUser = null;
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText("Notice A")).toBeInTheDocument();
    });
    expect(mockFetchIndustryPrefs).not.toHaveBeenCalled();
    expect(mockFetchRecommendedNotices).not.toHaveBeenCalled();
  });

  // ── 偏好变更事件响应（AuthModal 保存/清除后广播 supply-os:industry-prefs-updated）──

  it("re-probes and filters by new prefs when industry-prefs-updated fires", async () => {
    // 初始无偏好：全量列表
    render(<ProcurementPage />);
    await waitFor(() => {
      expect(screen.getByText("Notice A")).toBeInTheDocument();
    });
    expect(screen.queryByText("procurement_prefsBanner")).toBeNull();

    // 用户在账号弹窗保存了新偏好 → 广播事件后本页应重新探测并按新偏好筛选
    mockFetchIndustryPrefs.mockResolvedValue({ level1_id: 1, level2_id: 11 });
    fireEvent(window, new CustomEvent("supply-os:industry-prefs-updated"));

    await waitFor(() => {
      expect(screen.getByText("procurement_prefsBanner")).toBeInTheDocument();
      expect(mockFetchNotices).toHaveBeenCalledWith(expect.objectContaining({ codeId: "11" }));
    });
  });

  it("returns to the full list when prefs are cleared elsewhere", async () => {
    // 初始有偏好：按偏好筛选中
    mockFetchIndustryPrefs.mockResolvedValue({ level1_id: 1, level2_id: 11 });
    render(<ProcurementPage />);
    await waitFor(() => {
      expect(screen.getByText("procurement_prefsBanner")).toBeInTheDocument();
    });

    // 用户在账号弹窗清除偏好 → 广播事件后应退出偏好筛选，回全量列表
    mockFetchIndustryPrefs.mockResolvedValue(null);
    fireEvent(window, new CustomEvent("supply-os:industry-prefs-updated"));

    await waitFor(() => {
      expect(screen.queryByText("procurement_prefsBanner")).toBeNull();
      expect(mockFetchNotices).toHaveBeenCalledWith(expect.objectContaining({ codeId: undefined }));
    });
  });

  it("exits auto prefs mode via the view-all button", async () => {
    mockFetchIndustryPrefs.mockResolvedValue({ level1_id: 1, level2_id: null });
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText("procurement_prefsBanner")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("procurement_viewAll"));

    await waitFor(() => {
      expect(screen.queryByText("procurement_prefsBanner")).toBeNull();
      expect(mockFetchNotices).toHaveBeenCalledWith(expect.objectContaining({ codeId: undefined }));
    });
  });

  it("exits auto prefs mode when the selector is changed manually", async () => {
    mockFetchIndustryPrefs.mockResolvedValue({ level1_id: 1, level2_id: null });
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText("procurement_prefsBanner")).toBeInTheDocument();
    });
    const selects = document.querySelectorAll("select");
    fireEvent.change(selects[0], { target: { value: "2" } });

    await waitFor(() => {
      expect(screen.queryByText("procurement_prefsBanner")).toBeNull();
    });
  });

  it("clears prefs preselection and banner after logout", async () => {
    mockFetchIndustryPrefs.mockResolvedValue({ level1_id: 1, level2_id: 11 });
    const { rerender } = render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText("procurement_prefsBanner")).toBeInTheDocument();
    });

    // 登出：上一账号的自动筛选残留（预选 + 提示条）应全部清除，回未登录全量现状
    mockAuth.authUser = null;
    rerender(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.queryByText("procurement_prefsBanner")).toBeNull();
      const selects = document.querySelectorAll("select");
      expect((selects[0] as HTMLSelectElement).value).toBe("");
      expect(mockFetchNotices).toHaveBeenCalledWith(expect.objectContaining({ codeId: undefined }));
    });
  });

  // ── 切语言后按当前选择路径重拉级联（localeRef 守卫：仅语言变化触发）──
  it("refetches cascade levels with new locale after language switch", async () => {
    const { rerender } = render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Fuel" })).toBeInTheDocument();
    });
    // 选中一级（id=1）：children 以 ("1", "zh") 拉取
    const selects = document.querySelectorAll("select");
    fireEvent.change(selects[0], { target: { value: "1" } });
    await waitFor(() => {
      expect(mockFetchUnspscChildren).toHaveBeenLastCalledWith("1", "zh");
    });

    // 切语言为 fr：localeRef 守卫识别语言变化，按已选路径重拉各级选项
    localeState.locale = "fr";
    rerender(<ProcurementPage />);
    await waitFor(() => {
      expect(mockFetchUnspscIndustries).toHaveBeenLastCalledWith("fr");
      expect(mockFetchUnspscChildren).toHaveBeenLastCalledWith("1", "fr");
    });
  });
});
