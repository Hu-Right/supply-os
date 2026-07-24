import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NoticeCard } from "@/features/procurement/components/NoticeCard";
import { ProcurementPagination } from "@/features/procurement/components/ProcurementPagination";
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
    expect(screen.getByText("RFQ")).toBeInTheDocument();
    expect(screen.getByText("2026-12-31")).toBeInTheDocument();
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

describe("ProcurementPagination", () => {
  const onPageChange = vi.fn();

  it("renders page info", () => {
    render(
      <ProcurementPagination
        page={1}
        totalPages={5}
        serverPageSize={9}
        total={45}
        loading={false}
        onPageChange={onPageChange}
      />
    );
    expect(screen.getByText("procurement_prev")).toBeInTheDocument();
    expect(screen.getByText("procurement_next")).toBeInTheDocument();
  });

  it("disables prev button on first page", () => {
    render(
      <ProcurementPagination
        page={1}
        totalPages={5}
        serverPageSize={9}
        total={45}
        loading={false}
        onPageChange={onPageChange}
      />
    );
    const prevBtn = screen.getByText("procurement_prev").closest("button");
    expect(prevBtn).toBeDisabled();
  });

  it("disables next button on last page", () => {
    render(
      <ProcurementPagination
        page={5}
        totalPages={5}
        serverPageSize={9}
        total={45}
        loading={false}
        onPageChange={onPageChange}
      />
    );
    const nextBtn = screen.getByText("procurement_next").closest("button");
    expect(nextBtn).toBeDisabled();
  });

  it("calls onPageChange when next button clicked", () => {
    render(
      <ProcurementPagination
        page={1}
        totalPages={5}
        serverPageSize={9}
        total={45}
        loading={false}
        onPageChange={onPageChange}
      />
    );
    fireEvent.click(screen.getByText("procurement_next"));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("calls onPageChange when prev button clicked", () => {
    render(
      <ProcurementPagination
        page={3}
        totalPages={5}
        serverPageSize={9}
        total={45}
        loading={false}
        onPageChange={onPageChange}
      />
    );
    fireEvent.click(screen.getByText("procurement_prev"));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("disables buttons when loading", () => {
    render(
      <ProcurementPagination
        page={2}
        totalPages={5}
        serverPageSize={9}
        total={45}
        loading={true}
        onPageChange={onPageChange}
      />
    );
    const prevBtn = screen.getByText("procurement_prev").closest("button");
    const nextBtn = screen.getByText("procurement_next").closest("button");
    expect(prevBtn).toBeDisabled();
    expect(nextBtn).toBeDisabled();
  });
});
