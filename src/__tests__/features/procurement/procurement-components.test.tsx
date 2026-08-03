import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NoticeCard } from "@/features/procurement/components/NoticeCard";
import type { NoticeItem } from "@/types";

// ── Mock useLocale ──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

const mockNotice: NoticeItem = {
  id: 1,
  title: "Test Notice",
  description: "Test description",
  notice_type: "RFQ",
  deadline: "2026-12-31",
  agency: "Test Agency",
  country: "US",
  reference: "REF-001",
  core_locked: false,
  unspsc_codes: [{ code: "10000000", name: "Fuel" }],
};

describe("NoticeCard", () => {
  const onClick = vi.fn();

  it("renders notice info", () => {
    render(<NoticeCard item={mockNotice} onClick={onClick} />);
    expect(screen.getByText("Test Notice")).toBeInTheDocument();
    // 已知类型归一化为 i18n 键（mock t 原样返回键名）
    expect(screen.getByText("procurement_type_rfq")).toBeInTheDocument();
    expect(screen.getByText("2026-12-31")).toBeInTheDocument();
  });

  it("falls back to raw notice_type for unmapped values", () => {
    const rawType = { ...mockNotice, notice_type: "Timber Auction" };
    render(<NoticeCard item={rawType} onClick={onClick} />);
    expect(screen.getByText("Timber Auction")).toBeInTheDocument();
  });

  it("renders description", () => {
    render(<NoticeCard item={mockNotice} onClick={onClick} />);
    expect(screen.getByText("Test description")).toBeInTheDocument();
  });

  it("shows fallback when no description", () => {
    const noDesc = { ...mockNotice, description: undefined };
    render(<NoticeCard item={noDesc} onClick={onClick} />);
    expect(screen.getByText("procurement_noDesc")).toBeInTheDocument();
  });

  it("calls onClick when detail button clicked", () => {
    render(<NoticeCard item={mockNotice} onClick={onClick} />);
    fireEvent.click(screen.getByText("procurement_detail"));
    expect(onClick).toHaveBeenCalledWith(mockNotice);
  });

  it("renders UNSPSC codes when not locked", () => {
    render(<NoticeCard item={mockNotice} onClick={onClick} />);
    expect(screen.getByText("10000000")).toBeInTheDocument();
  });

  it("hides UNSPSC codes when locked", () => {
    const locked = { ...mockNotice, core_locked: true };
    render(<NoticeCard item={locked} onClick={onClick} />);
    expect(screen.queryByText("10000000")).toBeNull();
  });
});
