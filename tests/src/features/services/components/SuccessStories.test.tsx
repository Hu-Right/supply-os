/**
 * src/features/services/components/SuccessStories.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SuccessStories } from "@/features/services/components/SuccessStories";

const mockStories = [
  { date: "2026-01", title: "里程碑一", description: "描述一" },
  { date: "2026-03", title: "里程碑二", description: "描述二" },
  { date: "2026-06", title: "里程碑三", description: "描述三" },
];

describe("SuccessStories", () => {
  it("渲染标题", () => {
    render(<SuccessStories stories={mockStories} title="成功案例" />);
    expect(screen.getByText("成功案例")).toBeTruthy();
  });

  it("渲染所有故事条目", () => {
    render(<SuccessStories stories={mockStories} title="成功案例" />);
    expect(screen.getByText("里程碑一")).toBeTruthy();
    expect(screen.getByText("里程碑二")).toBeTruthy();
    expect(screen.getByText("里程碑三")).toBeTruthy();
  });

  it("渲染日期", () => {
    render(<SuccessStories stories={mockStories} title="成功案例" />);
    expect(screen.getByText("2026-01")).toBeTruthy();
  });

  it("渲染描述", () => {
    render(<SuccessStories stories={mockStories} title="成功案例" />);
    expect(screen.getByText("描述一")).toBeTruthy();
  });

  it("空 stories → 仅渲染标题", () => {
    render(<SuccessStories stories={[]} title="无案例" />);
    expect(screen.getByText("无案例")).toBeTruthy();
  });
});
