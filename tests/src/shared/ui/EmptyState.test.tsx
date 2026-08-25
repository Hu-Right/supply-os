/**
 * shared/ui/EmptyState 组件测试
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "@/shared/ui/EmptyState";

describe("EmptyState", () => {
  it("渲染默认标题", () => {
    render(<EmptyState />);
    expect(screen.getByText("暂无数据")).toBeInTheDocument();
  });

  it("自定义标题", () => {
    render(<EmptyState title="No results" />);
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("渲染描述", () => {
    render(<EmptyState description="Try different filters" />);
    expect(screen.getByText("Try different filters")).toBeInTheDocument();
  });

  it("无描述时不渲染 p 标签", () => {
    const { container } = render(<EmptyState title="Empty" />);
    expect(container.querySelector("p")).toBeNull();
  });

  it("渲染自定义 icon", () => {
    render(<EmptyState icon={<span data-testid="custom-icon">★</span>} />);
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });

  it("无自定义 icon 时渲染默认 Inbox 图标（mock 返回 null）", () => {
    const { container } = render(<EmptyState />);
    // 图标容器 div 始终渲染，mock 下 Inbox 返回 null
    expect(container.querySelector(".mb-3")).toBeTruthy();
  });

  it("渲染 action 插槽", () => {
    render(<EmptyState action={<button>Create</button>} />);
    expect(screen.getByRole("button", { name: /create/i })).toBeInTheDocument();
  });

  it("自定义 className", () => {
    const { container } = render(<EmptyState className="my-class" />);
    expect(container.firstChild).toHaveClass("my-class");
  });
});
