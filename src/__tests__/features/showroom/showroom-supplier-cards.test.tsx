import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ShowroomCard } from "@/features/showroom/components/ShowroomCard";
import { SupplierCard } from "@/features/supplier/components/SupplierCard";
import type { ExhibitionHall, Supplier } from "@/types";

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
  descriptionZh: "描述",
  descriptionEn: "Description",
  bannerUrl: "/banner.jpg",
  capacityValue: "5000㎡",
  featuredProductsZh: ["产品A", "产品B"],
  featuredProductsEn: ["Product A", "Product B"],
};

describe("ShowroomCard", () => {
  const onApply = vi.fn();
  const onConsult = vi.fn();

  it("renders showroom info", () => {
    render(<ShowroomCard showroom={mockShowroom} onApply={onApply} onConsult={onConsult} />);
    expect(screen.getByText("测试展厅")).toBeInTheDocument();
    expect(screen.getByText("描述")).toBeInTheDocument();
    expect(screen.getByText(/5000/)).toBeInTheDocument();
  });

  it("renders featured products", () => {
    render(<ShowroomCard showroom={mockShowroom} onApply={onApply} onConsult={onConsult} />);
    expect(screen.getByText("产品A")).toBeInTheDocument();
    expect(screen.getByText("产品B")).toBeInTheDocument();
  });

  it("calls onApply when apply button clicked", () => {
    render(<ShowroomCard showroom={mockShowroom} onApply={onApply} onConsult={onConsult} />);
    fireEvent.click(screen.getByText("showroomApplyBtn"));
    expect(onApply).toHaveBeenCalledWith(mockShowroom);
  });

  it("calls onConsult when consult button clicked", () => {
    render(<ShowroomCard showroom={mockShowroom} onApply={onApply} onConsult={onConsult} />);
    fireEvent.click(screen.getByText("showroomConsultBtn"));
    expect(onConsult).toHaveBeenCalledWith(mockShowroom);
  });
});

const mockSupplier: Supplier = {
  id: "sup1",
  nameZh: "测试供应商",
  nameEn: "Test Supplier",
  type: "domestic",
  status: "approved",
  countryZh: "中国",
  countryEn: "China",
  cityZh: "上海",
  cityEn: "Shanghai",
  industryZh: "制造业",
  industryEn: "Manufacturing",
  contactPerson: "张三",
  contactEmail: "zhang@test.com",
  contactPhone: "13800138000",
  ungmCode: "UNG-12345",
  mainProductsZh: ["零件A"],
  mainProductsEn: ["Part A"],
  complianceLabelsZh: ["ISO9001"],
  complianceLabelsEn: ["ISO9001"],
};

describe("SupplierCard", () => {
  const onAiMatch = vi.fn();
  const onContact = vi.fn();

  it("renders supplier info", () => {
    render(<SupplierCard supplier={mockSupplier} onAiMatch={onAiMatch} onContact={onContact} />);
    expect(screen.getByText("测试供应商")).toBeInTheDocument();
    expect(screen.getByText("supplierTypeDomestic")).toBeInTheDocument();
    expect(screen.getByText("supplierStatusVerified")).toBeInTheDocument();
  });

  it("shows pending status when applicable", () => {
    const pending = { ...mockSupplier, status: "pending" as const };
    render(<SupplierCard supplier={pending} onAiMatch={onAiMatch} onContact={onContact} />);
    expect(screen.getByText("supplierStatusPending")).toBeInTheDocument();
  });

  it("shows UN code when available", () => {
    render(<SupplierCard supplier={mockSupplier} onAiMatch={onAiMatch} onContact={onContact} />);
    expect(screen.getByText("UNG-12345")).toBeInTheDocument();
  });

  it("hides UN code when not available", () => {
    const noCode = { ...mockSupplier, ungmCode: undefined };
    render(<SupplierCard supplier={noCode} onAiMatch={onAiMatch} onContact={onContact} />);
    expect(screen.queryByText(/UNG-/)).toBeNull();
  });

  it("calls onAiMatch when AI match button clicked", () => {
    render(<SupplierCard supplier={mockSupplier} onAiMatch={onAiMatch} onContact={onContact} />);
    fireEvent.click(screen.getByText("supplierAiMatchBtn"));
    expect(onAiMatch).toHaveBeenCalledWith(mockSupplier);
  });

  it("calls onContact when contact button clicked", () => {
    render(<SupplierCard supplier={mockSupplier} onAiMatch={onAiMatch} onContact={onContact} />);
    fireEvent.click(screen.getByText("supplierContactBtn"));
    expect(onContact).toHaveBeenCalledWith(mockSupplier);
  });

  it("shows international type for overseas supplier", () => {
    const intl = { ...mockSupplier, type: "international" as const };
    render(<SupplierCard supplier={intl} onAiMatch={onAiMatch} onContact={onContact} />);
    expect(screen.getByText("supplierTypeIntl")).toBeInTheDocument();
  });
});
