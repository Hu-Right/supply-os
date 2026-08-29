import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Input } from "./Input";

describe("Input", () => {
  it("渲染基础输入框", () => {
    render(<Input placeholder="请输入" />);
    expect(screen.getByPlaceholderText("请输入")).toBeInTheDocument();
  });

  it("输入值变更触发 onChange", () => {
    const onChange = vi.fn();
    render(<Input onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "hello" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("error=true → 包含 border-rose-500 错误样式", () => {
    const { container } = render(<Input error />);
    const input = container.querySelector("input");
    expect(input?.className).toContain("border-rose-500");
  });

  it("error=false → 不包含错误样式", () => {
    const { container } = render(<Input />);
    const input = container.querySelector("input");
    expect(input?.className).not.toContain("border-rose-500");
  });

  it("disabled 状态正确传递", () => {
    render(<Input disabled placeholder="禁用" />);
    expect(screen.getByPlaceholderText("禁用")).toBeDisabled();
  });

  it("prefix 插槽渲染在输入框前", () => {
    render(<Input prefix={<span data-testid="prefix-icon">$</span>} />);
    expect(screen.getByTestId("prefix-icon")).toBeInTheDocument();
  });

  it("suffix 插槽渲染在输入框后", () => {
    render(<Input suffix={<span data-testid="suffix-text">USD</span>} />);
    expect(screen.getByTestId("suffix-text")).toBeInTheDocument();
  });

  it("leftIcon 等价于 prefix", () => {
    render(<Input leftIcon={<span data-testid="left-icon">🔍</span>} />);
    expect(screen.getByTestId("left-icon")).toBeInTheDocument();
  });

  it("透传 aria-label", () => {
    render(<Input aria-label="搜索框" />);
    expect(screen.getByLabelText("搜索框")).toBeInTheDocument();
  });
});
