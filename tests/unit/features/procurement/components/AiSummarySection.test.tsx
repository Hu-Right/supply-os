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
  competitiveLandscape: "本地医疗设备厂商主导，国际品牌需联合本地代理。",
  bidStrategy: "建议与本地经销商组成联合体投标，突出售后服务优势。",
  riskAlerts: "技术参数细节要求高，需本地售后服务能力。",
};

describe("AiSummarySection", () => {
  it("无数据但已配置时显示开始分析按钮", () => {
    const onStart = vi.fn();
    render(<AiSummarySection data={null} llmConfigured onStart={onStart} />);
    expect(screen.getByText("detail_aiSummaryTitle")).toBeInTheDocument();
    expect(screen.getByText("detail_aiSummaryStart")).toBeInTheDocument();
  });

  it("锁定态显示引导解锁面板而非开始分析按钮", () => {
    const onRequestUnlock = vi.fn();
    render(<AiSummarySection data={null} llmConfigured locked onRequestUnlock={onRequestUnlock} />);
    expect(screen.getByText("detail_aiSummaryTitle")).toBeInTheDocument();
    expect(screen.getByText("detail_aiSummaryErrorLocked")).toBeInTheDocument();
    expect(screen.getByText("procurement_unlockToViewFull")).toBeInTheDocument();
    // 锁定态不得出现"开始分析"按钮（点击必 403 core_locked）
    expect(screen.queryByText("detail_aiSummaryStart")).not.toBeInTheDocument();
  });

  it("未配置 LLM 且无数据时显示引导卡片", () => {
    render(<AiSummarySection data={null} llmConfigured={false} />);
    expect(screen.getByText("procurement_aiSummaryNeedConfig")).toBeInTheDocument();
    expect(screen.getByText(/procurement_aiSummaryGoConfig/)).toBeInTheDocument();
  });

  it("错误态显示友好提示与重试", () => {
    render(<AiSummarySection data={null} llmConfigured error="LLM 调用失败" />);
    expect(screen.getByText("procurement_aiSummaryError")).toBeInTheDocument();
    expect(screen.getByText("detail_aiSummaryErrorGeneric")).toBeInTheDocument();
  });

  it("加载中显示骨架屏", () => {
    render(<AiSummarySection loading />);
    expect(screen.getByText("detail_aiSummaryTitle")).toBeInTheDocument();
    const section = screen.getByText("detail_aiSummaryTitle").closest("section");
    expect(section?.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("有数据时显示 6 个子项标题", () => {
    render(<AiSummarySection data={mockData} />);
    expect(screen.getByText("detail_coreDeliverables")).toBeInTheDocument();
    expect(screen.getByText("detail_keyQualifications")).toBeInTheDocument();
    expect(screen.getByText("detail_paymentCycle")).toBeInTheDocument();
    expect(screen.getByText("detail_competitiveLandscape")).toBeInTheDocument();
    expect(screen.getByText("detail_bidStrategy")).toBeInTheDocument();
    expect(screen.getByText("detail_riskAlerts")).toBeInTheDocument();
  });

  it("有数据时显示内容文本", () => {
    render(<AiSummarySection data={mockData} />);
    expect(screen.getByText(/便携式数字影像设备/)).toBeInTheDocument();
    expect(screen.getByText(/ISO 13485/)).toBeInTheDocument();
    expect(screen.getByText(/本地医疗设备厂商主导/)).toBeInTheDocument();
  });

  it("流式状态显示分析中标识", () => {
    render(<AiSummarySection data={mockData} streaming />);
    expect(screen.getByText("detail_aiSummaryStreaming")).toBeInTheDocument();
  });

  it("显示'由 OS AI 分析生成'标注", () => {
    render(<AiSummarySection data={mockData} />);
    expect(screen.getByText("detail_aiSummaryBy")).toBeInTheDocument();
  });
});
