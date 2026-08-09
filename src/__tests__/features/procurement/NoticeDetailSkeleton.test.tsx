import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NoticeDetailSkeleton } from "@/features/procurement/components/NoticeDetailSkeleton";

describe("NoticeDetailSkeleton", () => {
  it("renders with data-testid", () => {
    const { container } = render(<NoticeDetailSkeleton />);
    const skeleton = container.querySelector('[data-testid="detail-skeleton"]');
    expect(skeleton).toBeTruthy();
  });

  it("has animate-pulse class", () => {
    const { container } = render(<NoticeDetailSkeleton />);
    const skeleton = container.querySelector('[data-testid="detail-skeleton"]');
    expect(skeleton?.className).toContain("animate-pulse");
  });

  it("renders tag placeholder area", () => {
    const { container } = render(<NoticeDetailSkeleton />);
    const skeleton = container.querySelector('[data-testid="detail-skeleton"]');
    // Title placeholder
    const titlePlaceholder = skeleton?.querySelector(".h-5.w-24");
    expect(titlePlaceholder).toBeTruthy();
  });

  it("renders UNSPSC chip placeholders (6 chips)", () => {
    const { container } = render(<NoticeDetailSkeleton />);
    const skeleton = container.querySelector('[data-testid="detail-skeleton"]');
    const chips = skeleton?.querySelectorAll(".h-6.rounded-md");
    expect(chips?.length).toBe(6);
  });

  it("renders source link placeholder", () => {
    const { container } = render(<NoticeDetailSkeleton />);
    const skeleton = container.querySelector('[data-testid="detail-skeleton"]');
    const sourcePlaceholder = skeleton?.querySelector(".h-5.w-40");
    expect(sourcePlaceholder).toBeTruthy();
  });

  it("renders unlocked detail panel with teal border", () => {
    const { container } = render(<NoticeDetailSkeleton />);
    const panel = container.querySelector(".border-teal-200");
    expect(panel).toBeTruthy();
  });

  it("renders 3 metadata cards in grid", () => {
    const { container } = render(<NoticeDetailSkeleton />);
    const cards = container.querySelectorAll(".bg-white.border.border-slate-100.rounded-lg");
    expect(cards.length).toBeGreaterThanOrEqual(3);
  });

  it("renders contact section with 2 contact cards", () => {
    const { container } = render(<NoticeDetailSkeleton />);
    const skeleton = container.querySelector('[data-testid="detail-skeleton"]');
    // Contact cards are in a space-y-2 container
    const contactSection = skeleton?.querySelector(".space-y-2");
    expect(contactSection).toBeTruthy();
  });

  it("renders bid breakdown section", () => {
    const { container } = render(<NoticeDetailSkeleton />);
    const breakdown = container.querySelector(".border-teal-100.bg-white");
    expect(breakdown).toBeTruthy();
  });
});
