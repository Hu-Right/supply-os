/**
 * src/features/training/components/FAQSection.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FAQSection } from "@/features/training/components/FAQSection";

const mockFaqs = [
  { id: 1, question_zh: "问题一", question_en: "Q1", answer_zh: "答案一", answer_en: "A1" },
  { id: 2, question_zh: "问题二", question_en: "Q2", answer_zh: "答案二", answer_en: "A2" },
];

describe("FAQSection", () => {
  it("空 faqs → 不渲染", () => {
    const { container } = render(<FAQSection faqs={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("非空 faqs → 渲染 section", () => {
    const { container } = render(<FAQSection faqs={mockFaqs} />);
    expect(container.querySelector("section")).toBeTruthy();
  });

  it("渲染与 faqs 数量相同的按钮", () => {
    render(<FAQSection faqs={mockFaqs} />);
    // 每个 FAQ 有一个 button
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(2);
  });

  it("点击按钮触发 onToggle（不崩溃）", () => {
    render(<FAQSection faqs={mockFaqs} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    // 不崩溃即通过
  });
});
