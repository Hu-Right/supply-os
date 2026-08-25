/**
 * features/procurement 骨架屏组件测试
 * NoticeDetailSkeleton + NoticeListSkeleton
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { NoticeDetailSkeleton } from "@/features/procurement/components/NoticeDetailSkeleton";
import { NoticeListSkeleton } from "@/features/procurement/components/NoticeListSkeleton";

describe("NoticeDetailSkeleton", () => {
  it("渲染骨架占位", () => {
    const { getByTestId } = render(<NoticeDetailSkeleton />);
    expect(getByTestId("detail-skeleton")).toBeInTheDocument();
  });

  it("包含 animate-pulse 动画", () => {
    const { getByTestId } = render(<NoticeDetailSkeleton />);
    expect(getByTestId("detail-skeleton").className).toContain("animate-pulse");
  });
});

describe("NoticeListSkeleton", () => {
  it("默认渲染 PAGE_SIZE(9) 张骨架卡片", () => {
    const { container } = render(<NoticeListSkeleton />);
    const cards = container.querySelectorAll(".animate-pulse");
    expect(cards.length).toBe(9);
  });

  it("自定义 count", () => {
    const { container } = render(<NoticeListSkeleton count={3} />);
    const cards = container.querySelectorAll(".animate-pulse");
    expect(cards.length).toBe(3);
  });

  it("容器含 aria-busy 无障碍属性", () => {
    const { container } = render(<NoticeListSkeleton count={1} />);
    expect(container.firstElementChild!.getAttribute("aria-busy")).toBe("true");
  });
});
