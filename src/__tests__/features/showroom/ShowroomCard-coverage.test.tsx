import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ShowroomCard } from "@/features/showroom/components/ShowroomCard";
import type { ExhibitionHall } from "@/types";

// ── Mock useLocale ──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
  pickLocale: (_locale: string, zh: string, en: string) => zh,
}));

const mockShowroom: ExhibitionHall = {
  id: "s1",
  nameZh: "测试展厅",
  nameEn: "Test Showroom",
  regionZh: "亚洲",
  regionEn: "Asia",
  countryZh: "中国",
  countryEn: "China",
  cityZh: "上海",
  cityEn: "Shanghai",
  descriptionZh: "描述内容",
  descriptionEn: "Description",
  bannerUrl: "/banner.jpg",
  capacityValue: "5000㎡",
  featuredProductsZh: ["产品A", "产品B"],
  featuredProductsEn: ["Product A", "Product B"],
};

describe("ShowroomCard — additional function coverage", () => {
  const onApply = vi.fn();
  const onConsult = vi.fn();

  // ── 1. Renders banner image ──
  it("renders banner image with correct src and alt", () => {
    render(<ShowroomCard showroom={mockShowroom} onApply={onApply} onConsult={onConsult} />);
    const img = screen.getByAltText("测试展厅");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/banner.jpg");
  });

  // ── 2. Renders region and country badge ──
  it("renders region and country badge", () => {
    render(<ShowroomCard showroom={mockShowroom} onApply={onApply} onConsult={onConsult} />);
    expect(screen.getByText(/亚洲/)).toBeInTheDocument();
    expect(screen.getByText(/中国/)).toBeInTheDocument();
  });

  // ── 3. Renders capacity value ──
  it("renders capacity value with label", () => {
    render(<ShowroomCard showroom={mockShowroom} onApply={onApply} onConsult={onConsult} />);
    expect(screen.getByText(/5000/)).toBeInTheDocument();
    expect(screen.getByText(/capacityLabel/)).toBeInTheDocument();
  });

  // ── 4. Renders featured products tags ──
  it("renders all featured products as tags", () => {
    render(<ShowroomCard showroom={mockShowroom} onApply={onApply} onConsult={onConsult} />);
    expect(screen.getByText("产品A")).toBeInTheDocument();
    expect(screen.getByText("产品B")).toBeInTheDocument();
  });

  // ── 5. Renders description ──
  it("renders showroom description", () => {
    render(<ShowroomCard showroom={mockShowroom} onApply={onApply} onConsult={onConsult} />);
    expect(screen.getByText("描述内容")).toBeInTheDocument();
  });

  // ── 6. Renders apply button with correct text ──
  it("renders apply button with i18n key", () => {
    render(<ShowroomCard showroom={mockShowroom} onApply={onApply} onConsult={onConsult} />);
    expect(screen.getByText("showroomApplyBtn")).toBeInTheDocument();
  });

  // ── 7. Renders consult button with correct text and title ──
  it("renders consult button with i18n key and title", () => {
    render(<ShowroomCard showroom={mockShowroom} onApply={onApply} onConsult={onConsult} />);
    const consultBtn = screen.getByText("showroomConsultBtn");
    expect(consultBtn).toBeInTheDocument();
    expect(consultBtn.closest("button")).toHaveAttribute("title", "showroomConsultTitle");
  });

  // ── 8. displayName is set ──
  it("has displayName set", () => {
    expect(ShowroomCard.displayName).toBe("ShowroomCard");
  });

  // ── 9. Featured products label ──
  it("renders featured products section label", () => {
    render(<ShowroomCard showroom={mockShowroom} onApply={onApply} onConsult={onConsult} />);
    expect(screen.getByText("featuredProducts")).toBeInTheDocument();
  });
});
