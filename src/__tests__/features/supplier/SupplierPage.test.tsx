import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SupplierPage from "@/features/supplier/pages/SupplierPage";

// ── Mock data ──
vi.mock("@/data", () => ({
  SUPPLIERS: [
    { id: 1, nameZh: "国内供应商A", nameEn: "Domestic A", type: "domestic", industryZh: "机械", industryEn: "Machinery", contactPerson: "张三", contactEmail: "a@test.com", contactPhone: "123", ungmCode: "" },
    { id: 2, nameZh: "国际供应商B", nameEn: "Intl B", type: "international", industryZh: "电子", industryEn: "Electronics", contactPerson: "John", contactEmail: "b@test.com", contactPhone: "456", ungmCode: "12345678" },
    { id: 3, nameZh: "国内供应商C", nameEn: "Domestic C", type: "domestic", industryZh: "机械", industryEn: "Machinery", contactPerson: "李四", contactEmail: "c@test.com", contactPhone: "789", ungmCode: "" },
  ],
}));

// ── Mock SupplierCard ──
vi.mock("@/features/supplier/components/SupplierCard", () => ({
  SupplierCard: ({ supplier, onAiMatch, onContact }: any) => (
    <div data-testid={`supplier-card-${supplier.id}`}>
      <span>{supplier.nameZh}</span>
      <button onClick={() => onAiMatch(supplier)}>ai-match</button>
      <button onClick={() => onContact(supplier)}>contact</button>
    </div>
  ),
}));

// ── Mock useLocale ──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
  pickLocale: (_l: string, zh: string, _en: string) => zh,
}));

// ── Mock useNavigate ──
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

describe("SupplierPage", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("renders type filter tabs (all/domestic/international)", () => {
    render(<SupplierPage />);
    expect(screen.getByText("supplierFilterAll")).toBeInTheDocument();
    expect(screen.getByText("supplierFilterDomestic")).toBeInTheDocument();
    expect(screen.getByText("supplierFilterIntl")).toBeInTheDocument();
  });

  it("filters by type: domestic only", () => {
    render(<SupplierPage />);
    fireEvent.click(screen.getByText("supplierFilterDomestic"));
    expect(screen.getByTestId("supplier-card-1")).toBeInTheDocument();
    expect(screen.queryByTestId("supplier-card-2")).toBeNull();
    expect(screen.getByTestId("supplier-card-3")).toBeInTheDocument();
  });

  it("filters by search term", () => {
    render(<SupplierPage />);
    const input = screen.getByPlaceholderText("searchSupplierPlaceholder");
    fireEvent.change(input, { target: { value: "供应商A" } });
    expect(screen.getByTestId("supplier-card-1")).toBeInTheDocument();
    expect(screen.queryByTestId("supplier-card-2")).toBeNull();
  });

  it("AI match button navigates to /crm", () => {
    render(<SupplierPage />);
    const card = screen.getByTestId("supplier-card-1");
    fireEvent.click(card.querySelector("button")!);
    expect(mockNavigate).toHaveBeenCalledWith("/crm");
  });

  it("shows empty state when no match", () => {
    render(<SupplierPage />);
    const input = screen.getByPlaceholderText("searchSupplierPlaceholder");
    fireEvent.change(input, { target: { value: "nonexistent_xyz" } });
    expect(screen.getByText("noData")).toBeInTheDocument();
  });
});
