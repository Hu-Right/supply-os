import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SupplierCardSkeleton } from "@/features/supplier/components/SupplierCardSkeleton";

describe("SupplierCardSkeleton", () => {
  it("renders with data-testid", () => {
    const { container } = render(<SupplierCardSkeleton />);
    const skeleton = container.querySelector('[data-testid="supplier-skeleton"]');
    expect(skeleton).toBeTruthy();
  });

  it("has animate-pulse class", () => {
    const { container } = render(<SupplierCardSkeleton />);
    const skeleton = container.querySelector('[data-testid="supplier-skeleton"]');
    expect(skeleton?.className).toContain("animate-pulse");
  });

  it("renders type tag placeholder", () => {
    const { container } = render(<SupplierCardSkeleton />);
    const skeleton = container.querySelector('[data-testid="supplier-skeleton"]');
    // Type tag is h-4 w-16
    const tagPlaceholder = skeleton?.querySelector(".h-4.w-16");
    expect(tagPlaceholder).toBeTruthy();
  });

  it("renders certification status placeholder", () => {
    const { container } = render(<SupplierCardSkeleton />);
    const skeleton = container.querySelector('[data-testid="supplier-skeleton"]');
    // Certification is h-4 w-14
    const certPlaceholder = skeleton?.querySelector(".h-4.w-14");
    expect(certPlaceholder).toBeTruthy();
  });

  it("renders company name placeholder", () => {
    const { container } = render(<SupplierCardSkeleton />);
    const skeleton = container.querySelector('[data-testid="supplier-skeleton"]');
    // Company name is h-5 w-3/4
    const namePlaceholder = skeleton?.querySelector(".h-5.w-3\\/4");
    expect(namePlaceholder).toBeTruthy();
  });

  it("renders location placeholder", () => {
    const { container } = render(<SupplierCardSkeleton />);
    const skeleton = container.querySelector('[data-testid="supplier-skeleton"]');
    // Location is h-3.5 w-1/2
    const locationPlaceholder = skeleton?.querySelector(".h-3\\.5.w-1\\/2");
    expect(locationPlaceholder).toBeTruthy();
  });

  it("renders product badges section", () => {
    const { container } = render(<SupplierCardSkeleton />);
    const skeleton = container.querySelector('[data-testid="supplier-skeleton"]');
    // Product badges are in flex-wrap containers
    const badgeSection = skeleton?.querySelectorAll(".flex.flex-wrap.gap-1");
    expect(badgeSection?.length).toBeGreaterThanOrEqual(2);
  });

  it("renders certification badges with emerald color", () => {
    const { container } = render(<SupplierCardSkeleton />);
    const emeraldBadges = container.querySelectorAll(".border-emerald-100");
    expect(emeraldBadges.length).toBeGreaterThan(0);
  });

  it("renders bottom action buttons placeholder", () => {
    const { container } = render(<SupplierCardSkeleton />);
    const skeleton = container.querySelector('[data-testid="supplier-skeleton"]');
    // Action buttons are h-7
    const actionButtons = skeleton?.querySelectorAll(".h-7");
    expect(actionButtons?.length).toBeGreaterThanOrEqual(2);
  });

  it("has displayName", () => {
    expect(SupplierCardSkeleton.displayName).toBe("SupplierCardSkeleton");
  });
});
