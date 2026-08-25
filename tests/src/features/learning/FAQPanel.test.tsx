/**
 * features/learning/components/FAQPanel 组件测试
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FAQPanel } from "@/features/learning/components/FAQPanel";
import type { FAQItem } from "@/types";

function makeFaq(overrides: Partial<FAQItem> = {}): FAQItem {
  return {
    id: "faq1",
    questionZh: "什么是 UNGM？",
    questionEn: "What is UNGM?",
    answerZh: "联合国全球市场",
    answerEn: "United Nations Global Marketplace",
    category: "ungm",
    ...overrides,
  };
}

describe("FAQPanel", () => {
  it("渲染默认标题", () => {
    render(<FAQPanel faqs={[]} />);
    expect(screen.getByText("常见问题 FAQ")).toBeInTheDocument();
  });

  it("自定义标题", () => {
    render(<FAQPanel faqs={[]} title="Help Center" />);
    expect(screen.getByText("Help Center")).toBeInTheDocument();
  });

  it("渲染 FAQ 列表", () => {
    // pickLocale mock 返回 "en"，所以问题和答案都显示 "en"
    const faqs = [makeFaq({ id: "1" }), makeFaq({ id: "2" })];
    const { container } = render(<FAQPanel faqs={faqs} />);
    // 2 个 FAQ 条目
    const items = container.querySelectorAll(".border-b");
    expect(items.length).toBe(2);
  });

  it("显示 category 大写标签", () => {
    render(<FAQPanel faqs={[makeFaq({ category: "exhibition" })]} />);
    expect(screen.getByText("EXHIBITION")).toBeInTheDocument();
  });

  it("空 faqs 时不渲染条目", () => {
    const { container } = render(<FAQPanel faqs={[]} />);
    expect(container.querySelectorAll(".border-b").length).toBe(0);
  });

  it("displayName 为 FAQPanel", () => {
    expect(FAQPanel.displayName).toBe("FAQPanel");
  });
});
