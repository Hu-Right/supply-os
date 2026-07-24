import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FAQPanel } from "@/features/learning/components/FAQPanel";
import { MaterialCard } from "@/features/learning/components/MaterialCard";
import type { FAQItem, LearningMaterial } from "@/types";

// ── Mock useLocale ──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
  pickLocale: (_locale: string, zh: string, en: string) => zh,
}));

const mockFaq: FAQItem = {
  id: "faq1",
  category: "general",
  questionZh: "什么是采购平台？",
  questionEn: "What is procurement platform?",
  answerZh: "这是一个采购平台",
  answerEn: "It is a procurement platform",
};

const baseMaterial: LearningMaterial = {
  id: "mat1",
  titleZh: "测试材料",
  titleEn: "Test Material",
  categoryZh: "分类",
  categoryEn: "Category",
  summaryZh: "摘要",
  summaryEn: "Summary",
  contentZh: "内容",
  contentEn: "Content",
  fileUrl: "/test.pdf",
  fileName: "test.pdf",
  downloadsCount: 100,
  isPremium: false,
};

describe("FAQPanel", () => {
  it("renders FAQ items", () => {
    render(<FAQPanel faqs={[mockFaq]} />);
    expect(screen.getByText("GENERAL")).toBeInTheDocument();
    expect(screen.getByText("Q: 什么是采购平台？")).toBeInTheDocument();
    expect(screen.getByText("这是一个采购平台")).toBeInTheDocument();
  });

  it("renders default title", () => {
    render(<FAQPanel faqs={[]} />);
    expect(screen.getByText("常见问题 FAQ")).toBeInTheDocument();
  });

  it("renders custom title", () => {
    render(<FAQPanel faqs={[]} title="Custom FAQ" />);
    expect(screen.getByText("Custom FAQ")).toBeInTheDocument();
  });
});

describe("MaterialCard", () => {
  const onDownload = vi.fn();
  const onUpgradeClick = vi.fn();

  it("renders material info", () => {
    render(
      <MaterialCard material={baseMaterial} isVip={false} onDownload={onDownload} onUpgradeClick={onUpgradeClick} />
    );
    expect(screen.getByText("测试材料")).toBeInTheDocument();
    expect(screen.getByText("摘要")).toBeInTheDocument();
  });

  it("shows download button for free material", () => {
    render(
      <MaterialCard material={baseMaterial} isVip={false} onDownload={onDownload} onUpgradeClick={onUpgradeClick} />
    );
    const btn = screen.getByText("downloadBtn");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onDownload).toHaveBeenCalledWith("/test.pdf", "test.pdf", "mat1");
  });

  it("shows locked state for premium material when not VIP", () => {
    const premium = { ...baseMaterial, isPremium: true };
    render(
      <MaterialCard material={premium} isVip={false} onDownload={onDownload} onUpgradeClick={onUpgradeClick} />
    );
    expect(screen.getByText("lockedPremium")).toBeInTheDocument();
    expect(screen.getByText("upgradeToVip")).toBeInTheDocument();
    fireEvent.click(screen.getByText("upgradeToVip"));
    expect(onUpgradeClick).toHaveBeenCalled();
  });

  it("shows unlocked state for premium material when VIP", () => {
    const premium = { ...baseMaterial, isPremium: true };
    render(
      <MaterialCard material={premium} isVip={true} onDownload={onDownload} onUpgradeClick={onUpgradeClick} />
    );
    expect(screen.getByText("unlockedPremium")).toBeInTheDocument();
    expect(screen.getByText("downloadBtn")).toBeInTheDocument();
  });

  it("disables download when no fileUrl", () => {
    const noFile = { ...baseMaterial, fileUrl: undefined };
    render(
      <MaterialCard material={noFile} isVip={false} onDownload={onDownload} onUpgradeClick={onUpgradeClick} />
    );
    const btn = screen.getByText("downloadBtn").closest("button");
    expect(btn).toBeDisabled();
  });

  it("uses titleZh as fallback fileName", () => {
    const noFileName = { ...baseMaterial, fileName: undefined };
    render(
      <MaterialCard material={noFileName} isVip={false} onDownload={onDownload} onUpgradeClick={onUpgradeClick} />
    );
    fireEvent.click(screen.getByText("downloadBtn"));
    expect(onDownload).toHaveBeenCalledWith("/test.pdf", "测试材料", "mat1");
  });
});
