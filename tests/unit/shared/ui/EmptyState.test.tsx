import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "@/shared/ui/EmptyState";

describe("EmptyState", () => {
  it("渲染标题", () => {
    render(<EmptyState title="暂无数据" />);
    expect(screen.getByText("暂无数据")).toBeInTheDocument();
  });

  it("渲染描述（可选）", () => {
    render(<EmptyState title="空" description="没有找到匹配的结果" />);
    expect(screen.getByText("没有找到匹配的结果")).toBeInTheDocument();
  });

  it("不传 description → 不渲染 <p>", () => {
    const { container } = render(<EmptyState title="空" />);
    expect(container.querySelector("p")).not.toBeInTheDocument();
  });

  it("渲染自定义 icon", () => {
    render(<EmptyState title="空" icon={<span data-testid="custom-icon">📭</span>} />);
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });

  it("不传 icon → 渲染默认 Inbox 图标（SVG）", () => {
    const { container } = render(<EmptyState title="空" />);
    // 默认 Inbox 图标是 lucide-react 的 SVG
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("渲染 action 插槽", () => {
    render(
      <EmptyState title="空" action={<button>新建</button>} />,
    );
    expect(screen.getByRole("button", { name: "新建" })).toBeInTheDocument();
  });

  it("不传 action → 不渲染 action 容器", () => {
    const { container } = render(<EmptyState title="空" />);
    // action 容器是最后一个 mt-4 div
    const actionDiv = container.querySelector(".mt-4");
    expect(actionDiv).not.toBeInTheDocument();
  });

  it("自定义 className 被合并", () => {
    const { container } = render(<EmptyState title="空" className="my-custom" />);
    expect(container.firstChild).toHaveClass("my-custom");
  });
});
