import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AiMatchmaker } from "@/features/crm/components/AiMatchmaker";
import type { Supplier, Opportunity } from "@/types";

// ── Mock useLocale ──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
  pickLocale: (_locale: string, zh: string, en: string) => zh,
}));

// ── Mock OPPORTUNITIES ──
vi.mock("@/data", () => ({
  OPPORTUNITIES: [
    { id: "opp1", titleZh: "采购机会A", titleEn: "Opportunity A" },
    { id: "opp2", titleZh: "采购机会B", titleEn: "Opportunity B" },
  ],
}));

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
  mainProductsZh: ["零件A"],
  mainProductsEn: ["Part A"],
  complianceLabelsZh: ["ISO9001"],
  complianceLabelsEn: ["ISO9001"],
};

const mockLabels = {
  title: "AI 匹配",
  description: "智能匹配供应商与采购机会",
  selectSupplier: "选择供应商",
  selectOpportunity: "选择机会",
  analyzing: "分析中...",
  trigger: "开始匹配",
  resultTitle: "匹配结果",
  resultBadge: "AI",
};

describe("AiMatchmaker", () => {
  const onSelectSupplier = vi.fn();
  const onSelectOpportunity = vi.fn();
  const onTrigger = vi.fn();

  it("renders title and description", () => {
    render(
      <AiMatchmaker
        suppliers={[mockSupplier]}
        selectedSupplier={null}
        selectedOpportunity={null}
        isMatching={false}
        report=""
        onSelectSupplier={onSelectSupplier}
        onSelectOpportunity={onSelectOpportunity}
        onTrigger={onTrigger}
        labels={mockLabels}
      />
    );
    expect(screen.getByText("AI 匹配")).toBeInTheDocument();
    expect(screen.getByText("智能匹配供应商与采购机会")).toBeInTheDocument();
  });

  it("renders supplier options in select", () => {
    render(
      <AiMatchmaker
        suppliers={[mockSupplier]}
        selectedSupplier={null}
        selectedOpportunity={null}
        isMatching={false}
        report=""
        onSelectSupplier={onSelectSupplier}
        onSelectOpportunity={onSelectOpportunity}
        onTrigger={onTrigger}
        labels={mockLabels}
      />
    );
    expect(screen.getByText("测试供应商")).toBeInTheDocument();
  });

  it("calls onSelectSupplier when supplier selected", () => {
    render(
      <AiMatchmaker
        suppliers={[mockSupplier]}
        selectedSupplier={null}
        selectedOpportunity={null}
        isMatching={false}
        report=""
        onSelectSupplier={onSelectSupplier}
        onSelectOpportunity={onSelectOpportunity}
        onTrigger={onTrigger}
        labels={mockLabels}
      />
    );
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "sup1" } });
    expect(onSelectSupplier).toHaveBeenCalledWith(mockSupplier);
  });

  it("calls onSelectOpportunity when opportunity selected", () => {
    render(
      <AiMatchmaker
        suppliers={[mockSupplier]}
        selectedSupplier={null}
        selectedOpportunity={null}
        isMatching={false}
        report=""
        onSelectSupplier={onSelectSupplier}
        onSelectOpportunity={onSelectOpportunity}
        onTrigger={onTrigger}
        labels={mockLabels}
      />
    );
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[1], { target: { value: "opp1" } });
    expect(onSelectOpportunity).toHaveBeenCalled();
  });

  it("calls onTrigger when match button clicked", () => {
    render(
      <AiMatchmaker
        suppliers={[mockSupplier]}
        selectedSupplier={null}
        selectedOpportunity={null}
        isMatching={false}
        report=""
        onSelectSupplier={onSelectSupplier}
        onSelectOpportunity={onSelectOpportunity}
        onTrigger={onTrigger}
        labels={mockLabels}
      />
    );
    fireEvent.click(screen.getByText("开始匹配"));
    expect(onTrigger).toHaveBeenCalled();
  });

  it("shows analyzing state when isMatching", () => {
    render(
      <AiMatchmaker
        suppliers={[mockSupplier]}
        selectedSupplier={null}
        selectedOpportunity={null}
        isMatching={true}
        report=""
        onSelectSupplier={onSelectSupplier}
        onSelectOpportunity={onSelectOpportunity}
        onTrigger={onTrigger}
        labels={mockLabels}
      />
    );
    expect(screen.getByText("分析中...")).toBeInTheDocument();
  });

  it("shows report when available", () => {
    render(
      <AiMatchmaker
        suppliers={[mockSupplier]}
        selectedSupplier={null}
        selectedOpportunity={null}
        isMatching={false}
        report="匹配度 95%"
        onSelectSupplier={onSelectSupplier}
        onSelectOpportunity={onSelectOpportunity}
        onTrigger={onTrigger}
        labels={mockLabels}
      />
    );
    expect(screen.getByText("匹配结果")).toBeInTheDocument();
    expect(screen.getByText("匹配度 95%")).toBeInTheDocument();
  });

  it("hides report section when report is empty", () => {
    render(
      <AiMatchmaker
        suppliers={[mockSupplier]}
        selectedSupplier={null}
        selectedOpportunity={null}
        isMatching={false}
        report=""
        onSelectSupplier={onSelectSupplier}
        onSelectOpportunity={onSelectOpportunity}
        onTrigger={onTrigger}
        labels={mockLabels}
      />
    );
    expect(screen.queryByText("匹配结果")).toBeNull();
  });
});
