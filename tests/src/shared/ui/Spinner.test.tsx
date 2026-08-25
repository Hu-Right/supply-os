/**
 * shared/ui/Spinner 组件测试
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Spinner } from "@/shared/ui/Spinner";

describe("Spinner", () => {
  it("渲染 role=status", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("aria-label 使用 t(uiLoading)", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "uiLoading");
  });

  it("默认 size=md", () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector("svg")).toHaveClass("h-6", "w-6");
  });

  it("size=sm", () => {
    const { container } = render(<Spinner size="sm" />);
    expect(container.querySelector("svg")).toHaveClass("h-4", "w-4");
  });

  it("size=lg", () => {
    const { container } = render(<Spinner size="lg" />);
    expect(container.querySelector("svg")).toHaveClass("h-8", "w-8");
  });

  it("自定义 className", () => {
    const { container } = render(<Spinner className="extra" />);
    expect(container.firstChild).toHaveClass("extra");
  });
});
