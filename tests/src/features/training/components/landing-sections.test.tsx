/**
 * 研修班落地页多个小型组件的合并测试
 * 覆盖: landing-ui, StatsSection, CTASection, WhySection, ValueSection,
 *       HighlightsSection, MaterialsSection, SyllabusSection
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SectionTitle, NAVY, GREEN, GREEN_HOVER, GREEN_DEEP, INK, BG_LIGHT, BORDER } from "@/features/training/components/landing-ui";
import { StatsSection } from "@/features/training/components/StatsSection";
import { CTASection } from "@/features/training/components/CTASection";
import { WhySection } from "@/features/training/components/WhySection";
import { ValueSection } from "@/features/training/components/ValueSection";
import { HighlightsSection } from "@/features/training/components/HighlightsSection";
import { MaterialsSection } from "@/features/training/components/MaterialsSection";
import { SyllabusSection } from "@/features/training/components/SyllabusSection";

describe("landing-ui 配色常量", () => {
  it("导出为有效 hex 颜色", () => {
    for (const c of [NAVY, GREEN, GREEN_HOVER, GREEN_DEEP, INK, BG_LIGHT, BORDER]) {
      expect(c).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});

describe("SectionTitle", () => {
  it("渲染标题文本", () => {
    render(<SectionTitle title="测试标题" />);
    expect(screen.getByText("测试标题")).toBeTruthy();
  });

  it("有 sub 时渲染副标题", () => {
    render(<SectionTitle title="主标题" sub="副标题" />);
    expect(screen.getByText("副标题")).toBeTruthy();
  });

  it("light=true 时标题使用白色 class", () => {
    const { container } = render(<SectionTitle title="亮色标题" light />);
    const h2 = container.querySelector("h2");
    expect(h2?.className).toContain("text-white");
  });
});

describe("StatsSection", () => {
  it("渲染 4 个统计指标", () => {
    const { container } = render(<StatsSection />);
    // 4 个 grid 子项
    const items = container.querySelectorAll(".grid > div");
    expect(items.length).toBe(4);
  });
});

describe("CTASection", () => {
  it("渲染两个按钮", () => {
    const onEnroll = vi.fn();
    const onConsult = vi.fn();
    render(<CTASection onEnroll={onEnroll} onConsult={onConsult} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(2);
  });

  it("点击报名按钮触发 onEnroll", () => {
    const onEnroll = vi.fn();
    render(<CTASection onEnroll={onEnroll} onConsult={() => {}} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(onEnroll).toHaveBeenCalled();
  });
});

describe("WhySection", () => {
  it("渲染 3 张卡片", () => {
    const { container } = render(<WhySection />);
    const cards = container.querySelectorAll(".grid > div");
    expect(cards.length).toBe(3);
  });
});

describe("ValueSection", () => {
  it("渲染 5 个价值项", () => {
    const { container } = render(<ValueSection />);
    const items = container.querySelectorAll(".grid > div");
    expect(items.length).toBe(5);
  });
});

describe("HighlightsSection", () => {
  it("渲染 section 容器", () => {
    const { container } = render(<HighlightsSection />);
    expect(container.querySelector("section")).toBeTruthy();
    // 3 张卡片
    const cards = container.querySelectorAll(".grid > div");
    expect(cards.length).toBe(3);
  });
});

describe("MaterialsSection", () => {
  it("渲染二维码图片", () => {
    const { container } = render(<MaterialsSection />);
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.src).toContain("wechat-service-qr.png");
  });

  it("渲染 4 个要点", () => {
    const { container } = render(<MaterialsSection />);
    const items = container.querySelectorAll("li");
    expect(items.length).toBe(4);
  });
});

describe("SyllabusSection", () => {
  it("渲染 3 个课程模块", () => {
    const { container } = render(<SyllabusSection />);
    // 3 个模块编号 (1, 2, 3)
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });
});
