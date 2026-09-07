import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

import { AiSummarySection } from "@/features/procurement/components/AiSummarySection";

const mockData = {
  coreDeliverables: "便携式数字影像设备（含主机、探测器、工作站）及配套耗材与备件。",
  keyQualifications: "ISO 13485、CE 认证、近三年同类项目业绩。",
  paymentAndCycle: "合同签订后 30% 预付款，交付验收后 60%，质保期后 10%。",
  riskAlerts: "技术参数细节要求高，需本地售后服务能力。",
};

describe("AiSummarySection", () => {
  it("无数据时显示占位提示", () => {
    render(<AiSummarySection data={null} />);
    // mock t() 返回 key
    expect(screen.getByText("procurement_aiSummaryTitle")).toBeInTheDocument();
  });

  it("加载中显示骨架屏", () => {
    render(<AiSummarySection loading />);
    expect(screen.getByText("procurement_aiSummaryTitle")).toBeInTheDocument();
    const section = screen.getByText("procurement_aiSummaryTitle").closest("section");
    expect(section?.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("有数据时显示 4 个子项标题", () => {
    render(<AiSummarySection data={mockData} isUnlocked />);
    // mock t() 返回 key
    expect(screen.getByText("procurement_aiSummaryDeliverables")).toBeInTheDocument();
    expect(screen.getByText("procurement_aiSummaryQualifications")).toBeInTheDocument();
    expect(screen.getByText("procurement_aiSummaryPayment")).toBeInTheDocument();
    expect(screen.getByText("procurement_aiSummaryRisks")).toBeInTheDocument();
  });

  it("有数据时显示内容文本", () => {
    render(<AiSummarySection data={mockData} isUnlocked />);
    expect(screen.getByText(/便携式数字影像设备/)).toBeInTheDocument();
    expect(screen.getByText(/ISO 13485/)).toBeInTheDocument();
  });

  it("免费用户（isUnlocked=false）锁定后 2 项", () => {
    render(<AiSummarySection data={mockData} isUnlocked={false} />);
    // mock t() 返回 key
    expect(screen.getByText("procurement_aiSummaryDeliverables")).toBeInTheDocument();
    expect(screen.getByText("procurement_aiSummaryQualifications")).toBeInTheDocument();
    expect(screen.getAllByText("procurement_aiSummaryLocked")).toHaveLength(2);
  });

  it("显示'由 OS AI 分析生成'标注", () => {
    render(<AiSummarySection data={mockData} isUnlocked />);
    // mock t() 返回 key
    expect(screen.getByText("procurement_aiSummaryBy")).toBeInTheDocument();
  });
});
