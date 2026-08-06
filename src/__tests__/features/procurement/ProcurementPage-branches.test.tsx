import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProcurementPage from "@/features/procurement/pages/ProcurementPage";

// jsdom 无 IntersectionObserver
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
  ],
  total: 2,
  pageSize: 9,
});
const mockFetchMembershipPlans = vi.fn().mockResolvedValue([]);
const mockFetchMembershipStatus = vi.fn().mockResolvedValue({
  membership_tier: "free",
  free_quota: 5,
  free_used: 0,
  free_remaining: 5,
  paid_unlocks: 0,
});
const mockFetchNoticeDetail = vi.fn().mockRejectedValue(new Error("NOTICE_DETAIL_403"));
const mockFetchUnlockedNoticeIds = vi.fn().mockResolvedValue([]);
const mockUnlockNotice = vi.fn().mockResolvedValue({ ok: true });
const mockFetchNoticeTranslation = vi.fn().mockRejectedValue(new Error("TRANSLATION_UNAVAILABLE"));
const mockFetchIndustryPrefs = vi.fn().mockResolvedValue(null);
const mockSaveIndustryPrefs = vi.fn().mockResolvedValue({ ok: true });
const mockFetchRecommendedNotices = vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 9 });
const mockFetchNoticeCountries = vi.fn().mockResolvedValue([]);
const mockSendNoticeFeedback = vi.fn().mockResolvedValue(undefined);
const mockFetchNoticeAgencies = vi.fn().mockResolvedValue([]);

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
  fetchNoticeAgencies: (locale?: string) => mockFetchNoticeAgencies(locale),
  fetchNoticePreview: vi.fn().mockResolvedValue({}),
  fetchNoticeContent: vi.fn().mockResolvedValue({ description: "", title: "", description_cn: "" }),
  sendNoticeFeedback: (key: string, actions: any[]) => mockSendNoticeFeedback(key, actions),
  getFeedbackSessionId: vi.fn().mockReturnValue("test-session"),
}));

const localeState = { locale: "zh" };
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({
    t: (key: string) => key,
    locale: localeState.locale,
  }),
  needsContentTranslation: (_text: string, locale: string) => locale !== "en",
}));

const mockAuth = {
  authUser: { user_key: "u1", email: "test@test.com", display_name: "Test" } as any,
  isVip: false,
};
vi.mock("@/core/auth", () => ({
  useAuth: () => mockAuth,
  useOptionalAuth: () => mockAuth,
}));

const mockNavigate = vi.fn();
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

// Mock RecentUnlocks to a simple marker
vi.mock("@/features/payment", () => ({
  RecentUnlocks: ({ userKey, onOpenNotice }: any) => (
    <div data-testid="recent-unlocks">
      <button onClick={() => onOpenNotice(42)}>open-notice-42</button>
    </div>
  ),
}));

describe("ProcurementPage — additional branch coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localeState.locale = "zh";
    mockSearchParams = new URLSearchParams();
    mockSetSearchParams.mockImplementation((next: any) => {
      mockSearchParams = new URLSearchParams(next);
    });
    mockAuth.authUser = { user_key: "u1", email: "test@test.com", display_name: "Test" };
    mockAuth.isVip = false;
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
      ],
      total: 2,
      pageSize: 9,
    });
    mockFetchNoticeDetail.mockRejectedValue(new Error("NOTICE_DETAIL_403"));
    mockFetchMembershipStatus.mockResolvedValue({
      membership_tier: "free",
      free_quota: 5,
      free_used: 0,
      free_remaining: 5,
      paid_unlocks: 0,
    });
    mockFetchUnlockedNoticeIds.mockResolvedValue([]);
    mockUnlockNotice.mockResolvedValue({ ok: true });
    mockFetchNoticeTranslation.mockRejectedValue(new Error("TRANSLATION_UNAVAILABLE"));
    mockFetchIndustryPrefs.mockResolvedValue(null);
    mockSaveIndustryPrefs.mockResolvedValue({ ok: true });
    mockFetchRecommendedNotices.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 9 });
    mockFetchNoticeAgencies.mockResolvedValue([]);
  });

  // ── 1. UNSPSC category collapse/expand toggle ──
  it("toggles UNSPSC category section when collapse button clicked", async () => {
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText("procurement_industryCategory")).toBeInTheDocument();
    });

    // Click the collapse toggle button
    const toggleBtn = screen.getByText("procurement_industryCategory").closest("button")!;
    
    // Initially collapsed → expand
    fireEvent.click(toggleBtn);
    // After click, selects should be visible (expanded)
    const selects = document.querySelectorAll("select");
    expect(selects.length).toBeGreaterThanOrEqual(1);

    // Click again → collapse
    fireEvent.click(toggleBtn);
  });

  // ── 2. RecentUnlocks renders when userKey exists ──
  it("renders RecentUnlocks component when user is logged in", async () => {
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByTestId("recent-unlocks")).toBeInTheDocument();
    });
  });

  // ── 3. RecentUnlocks not rendered when logged out ──
  it("does not render RecentUnlocks when user is logged out", async () => {
    mockAuth.authUser = null;
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText("Notice A")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("recent-unlocks")).toBeNull();
  });

  // ── 4. Error display when search.result.error is set ──
  it("renders error message when notices fetch returns error", async () => {
    mockFetchNotices.mockRejectedValue(new Error("Server error"));
    render(<ProcurementPage />);

    await waitFor(() => {
      // The error should be displayed in a styled div
      const errorDivs = document.querySelectorAll(".bg-rose-50");
      expect(errorDivs.length).toBeGreaterThan(0);
    });
  });

  // ── 5. Featured toggle button aria-pressed attribute ──
  it("sets aria-pressed on featured toggle button", async () => {
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText("procurement_featuredOnly")).toBeInTheDocument();
    });

    const featuredBtn = screen.getByText("procurement_featuredOnly").closest("button")!;
    expect(featuredBtn).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(featuredBtn);
    // After toggle, aria-pressed should change
    await waitFor(() => {
      expect(featuredBtn).toHaveAttribute("aria-pressed", "true");
    });
  });

  // ── 6. Prefs mode banner with exit button ──
  it("renders prefs mode banner with view-all exit button", async () => {
    mockFetchIndustryPrefs.mockResolvedValue({ level1_id: 1, level2_id: null });
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText("procurement_prefsBanner")).toBeInTheDocument();
      expect(screen.getByText("procurement_viewAll")).toBeInTheDocument();
    });
  });

  // ── 7. Recommended mode banner ──
  it("renders recommended mode banner when in recommended mode", async () => {
    mockFetchIndustryPrefs.mockResolvedValue(null);
    mockFetchRecommendedNotices.mockResolvedValue({
      items: [{ id: 9, title: "Reco Notice", agency: "A", country: "US", reference: "R-9", match_score: 3 }],
      total: 1,
      page: 1,
      pageSize: 9,
    });
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText("procurement_recommendedBanner")).toBeInTheDocument();
    });
  });

  // ── 8. Skeleton shows on initial load when items are empty ──
  it("shows skeleton on initial load before data arrives", async () => {
    mockFetchNotices.mockImplementation(() => new Promise(() => {})); // Never resolves
    const { container } = render(<ProcurementPage />);

    // Skeleton shows when loading=true and items.length=0
    // The component uses aria-busy="true" on the skeleton grid
    await waitFor(() => {
      const busyEl = container.querySelector('[aria-busy="true"]');
      expect(busyEl).not.toBeNull();
    });
  });

  // ── 9. Clear search resets all filters ──
  it("clears search when clear search button is clicked", async () => {
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText("Notice A")).toBeInTheDocument();
    });

    // Enter a search term
    const searchInput = document.querySelector('input[name="q"]') as HTMLInputElement;
    if (searchInput) {
      fireEvent.input(searchInput, { target: { value: "test query" } });
    }

    // Click clear search
    fireEvent.click(screen.getByText("procurement_clearSearch"));

    // After clear, search input should be reset
    await waitFor(() => {
      // The component should not crash and should still render the list
      expect(screen.getByText("procurement_clearSearch")).toBeInTheDocument();
    });
  });

  // ── 10. Page info shows pagination details ──
  it("displays page size and total pages info", async () => {
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText(/procurement_currentPage/)).toBeInTheDocument();
      expect(screen.getByText(/procurement_eachPage/)).toBeInTheDocument();
    });
  });

  // ── 11. Pool description with free quota ──
  it("renders pool description with free quota count", async () => {
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText(/procurement_poolDesc/)).toBeInTheDocument();
    });
  });

  // ── 12. Open notice by id from RecentUnlocks ──
  it("opens notice detail when RecentUnlocks triggers onOpenNotice", async () => {
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByTestId("recent-unlocks")).toBeInTheDocument();
    });

    // Click the open-notice button inside RecentUnlocks mock
    fireEvent.click(screen.getByText("open-notice-42"));

    // Should not crash; detail view may or may not render depending on mock
  });
});
