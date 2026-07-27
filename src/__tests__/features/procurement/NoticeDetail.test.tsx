import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NoticeDetail } from "@/features/procurement/components/NoticeDetail";

// ── Mock useLocale ──（en：翻译 hook 零请求，用例与译文解耦）
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "en" }),
}));

const mockNotice = {
  id: 1,
  title: "Test Notice",
  agency: "Test Agency",
  country: "US",
  reference: "REF-001",
  deadline: "2026-12-31",
  description: "Test description",
  source_url: "https://example.com",
  notice_type: "Open Tender",
  unspsc_codes: [{ code: "1000", name: "Fuel" }],
};

const unlockedNotice = { ...mockNotice, core_locked: false };

describe("NoticeDetail", () => {
  const defaultProps = {
    notice: mockNotice as any,
    actionMessage: "",
    membership: null,
    freeRemaining: 2,
    freeQuota: 2,
    canUsePaidQuota: false,
    isVip: false,
    onBack: vi.fn(),
    onExpressInterest: vi.fn(),
    onUnlock: vi.fn(),
    onPayUnlock: vi.fn(),
  };

  it("renders notice title, country and unlocked agency", () => {
    render(<NoticeDetail {...defaultProps} notice={unlockedNotice as any} />);
    expect(screen.getByText("Test Notice")).toBeInTheDocument();
    expect(screen.getAllByText("Test Agency").length).toBeGreaterThan(0);
    expect(screen.getByText("US")).toBeInTheDocument();
  });

  it("calls onBack when back button clicked", () => {
    render(<NoticeDetail {...defaultProps} />);
    fireEvent.click(screen.getByText("procurement_back"));
    expect(defaultProps.onBack).toHaveBeenCalled();
  });

  it("calls onExpressInterest with 'interested' type", () => {
    render(<NoticeDetail {...defaultProps} />);
    fireEvent.click(screen.getByText("procurement_interested"));
    expect(defaultProps.onExpressInterest).toHaveBeenCalledWith(mockNotice, "interested");
  });

  it("calls onExpressInterest with 'subscribed' type", () => {
    render(<NoticeDetail {...defaultProps} />);
    fireEvent.click(screen.getByText("procurement_subscribeNotice"));
    expect(defaultProps.onExpressInterest).toHaveBeenCalledWith(mockNotice, "subscribed");
  });

  it("calls onUnlock when unlock button clicked", () => {
    render(<NoticeDetail {...defaultProps} />);
    fireEvent.click(screen.getByText(/procurement_freeUnlock/));
    expect(defaultProps.onUnlock).toHaveBeenCalledWith(mockNotice);
  });

  it("calls onPayUnlock when the single paid-unlock button is clicked", () => {
    render(<NoticeDetail {...defaultProps} />);
    fireEvent.click(screen.getByText("procurement_singleUnlock"));
    expect(defaultProps.onPayUnlock).toHaveBeenCalledWith(mockNotice);
  });

  it("hides the paid-unlock button when notice is already unlocked", () => {
    render(<NoticeDetail {...defaultProps} notice={unlockedNotice as any} />);
    expect(screen.queryByText("procurement_singleUnlock")).not.toBeInTheDocument();
  });

  it("shows action message when provided", () => {
    render(<NoticeDetail {...defaultProps} actionMessage="Success!" />);
    expect(screen.getByText("Success!")).toBeInTheDocument();
  });

  it("shows source URL link when unlocked", () => {
    render(<NoticeDetail {...defaultProps} notice={unlockedNotice as any} />);
    expect(screen.getByText("procurement_source")).toBeInTheDocument();
  });

  it("renders UNSPSC tags when unlocked", () => {
    render(<NoticeDetail {...defaultProps} notice={unlockedNotice as any} />);
    expect(screen.getByText("1000")).toBeInTheDocument();
  });

  // ── P1-B: core-locked mask gating ──
  it("shows the locked-core mask and hides core details when core is locked", () => {
    render(<NoticeDetail {...defaultProps} />);
    // Mask box title + description
    expect(screen.getByText("procurement_lockedCoreDesc")).toBeInTheDocument();
    // Masked agency: title appears (subtitle + meta grid + mask heading), never real agency
    expect(screen.queryByText("Test Agency")).toBeNull();
    // UNSPSC tags and source link hidden
    expect(screen.queryByText("1000")).toBeNull();
    expect(screen.queryByText("procurement_source")).toBeNull();
  });

  it("reveals real agency, tags and source when core is unlocked", () => {
    render(<NoticeDetail {...defaultProps} notice={unlockedNotice as any} />);
    expect(screen.getAllByText("Test Agency").length).toBeGreaterThan(0);
    expect(screen.getByText("1000")).toBeInTheDocument();
    expect(screen.getByText("procurement_source")).toBeInTheDocument();
    // Mask description should not be shown
    expect(screen.queryByText("procurement_lockedCoreDesc")).toBeNull();
  });

  // ── 闪烁修复：detailLoading 骨架屏 ──
  it("shows skeleton instead of locked panel while detailLoading", () => {
    render(<NoticeDetail {...defaultProps} detailLoading />);
    expect(screen.getByTestId("detail-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("procurement_lockedCoreDesc")).toBeNull();
    expect(screen.queryByText("procurement_singleUnlock")).toBeNull();
    expect(screen.getAllByText("procurement_loading").length).toBeGreaterThan(0);
  });

  it("ignores detailLoading once core is unlocked", () => {
    render(<NoticeDetail {...defaultProps} notice={unlockedNotice as any} detailLoading />);
    expect(screen.queryByTestId("detail-skeleton")).toBeNull();
    expect(screen.getAllByText("Test Agency").length).toBeGreaterThan(0);
  });

  it("renders no translation UI in en locale", () => {
    render(<NoticeDetail {...defaultProps} notice={unlockedNotice as any} />);
    expect(screen.queryByText("procurement_translating")).toBeNull();
    expect(screen.queryByText("procurement_viewOriginal")).toBeNull();
    expect(screen.queryByText("procurement_translateNote")).toBeNull();
  });

  // ── notice_type 本地化：已知类型映射 i18n 键，未知类型原样回退 ──
  it("localizes known notice_type via i18n key", () => {
    render(<NoticeDetail {...defaultProps} />);
    // "Open Tender" 命中 tender 规则 → itb 键（mock t 原样返回键名）
    expect(screen.getByText("procurement_type_itb")).toBeInTheDocument();
    expect(screen.queryByText("Open Tender")).toBeNull();
  });

  it("falls back to raw notice_type for unmapped values", () => {
    render(
      <NoticeDetail {...defaultProps} notice={{ ...mockNotice, notice_type: "Timber Auction" } as any} />
    );
    expect(screen.getByText("Timber Auction")).toBeInTheDocument();
  });
});
