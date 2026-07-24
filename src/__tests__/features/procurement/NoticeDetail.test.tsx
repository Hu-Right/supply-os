import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NoticeDetail } from "@/features/procurement/components/NoticeDetail";

// ── Mock useLocale ──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
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
  };

  it("renders notice title and details", () => {
    render(<NoticeDetail {...defaultProps} />);
    expect(screen.getByText("Test Notice")).toBeInTheDocument();
    expect(screen.getByText("Test Agency")).toBeInTheDocument();
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

  it("shows action message when provided", () => {
    render(<NoticeDetail {...defaultProps} actionMessage="Success!" />);
    expect(screen.getByText("Success!")).toBeInTheDocument();
  });

  it("shows source URL link when available", () => {
    render(<NoticeDetail {...defaultProps} />);
    expect(screen.getByText("procurement_source")).toBeInTheDocument();
  });

  it("renders UNSPSC tags", () => {
    render(<NoticeDetail {...defaultProps} />);
    expect(screen.getByText("1000")).toBeInTheDocument();
  });
});
