/**
 * src/features/training/components/HeroSection.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HeroSection } from "@/features/training/components/HeroSection";

describe("HeroSection", () => {
  it("渲染 section 容器", () => {
    const { container } = render(
      <HeroSection course={null} onEnroll={() => {}} onConsult={() => {}} />,
    );
    expect(container.querySelector("section")).toBeTruthy();
  });

  it("渲染两个按钮", () => {
    render(<HeroSection course={null} onEnroll={() => {}} onConsult={() => {}} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(2);
  });

  it("点击报名触发 onEnroll", () => {
    const onEnroll = vi.fn();
    render(<HeroSection course={null} onEnroll={onEnroll} onConsult={() => {}} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(onEnroll).toHaveBeenCalled();
  });

  it("点击咨询触发 onConsult", () => {
    const onConsult = vi.fn();
    render(<HeroSection course={null} onEnroll={() => {}} onConsult={onConsult} />);
    fireEvent.click(screen.getAllByRole("button")[1]);
    expect(onConsult).toHaveBeenCalled();
  });

  it("渲染地球装饰图片", () => {
    const { container } = render(<HeroSection course={null} onEnroll={() => {}} onConsult={() => {}} />);
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.src).toContain("earth.png");
  });

  it("渲染 4 个信任标签（chips）", () => {
    const { container } = render(<HeroSection course={null} onEnroll={() => {}} onConsult={() => {}} />);
    // 4 个 chip span（含 svg icon）
    const spans = container.querySelectorAll(".flex-wrap.gap-x-8 span");
    expect(spans.length).toBe(4);
  });
});
