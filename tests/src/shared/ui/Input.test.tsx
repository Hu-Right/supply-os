/**
 * shared/ui/Input 组件测试
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "@/shared/ui/Input";

describe("Input", () => {
  it("渲染 input 元素", () => {
    render(<Input aria-label="name" />);
    expect(screen.getByRole("textbox", { name: /name/i })).toBeInTheDocument();
  });

  it("透传 placeholder", () => {
    render(<Input placeholder="Enter..." aria-label="field" />);
    expect(screen.getByPlaceholderText("Enter...")).toBeInTheDocument();
  });

  it("error 状态添加错误样式", () => {
    render(<Input error aria-label="err" />);
    expect(screen.getByRole("textbox")).toHaveClass("border-rose-500");
  });

  it("渲染 prefix 插槽", () => {
    render(<Input prefix={<span data-testid="pre">$</span>} aria-label="amount" />);
    expect(screen.getByTestId("pre")).toBeInTheDocument();
  });

  it("渲染 suffix 插槽", () => {
    render(<Input suffix={<span data-testid="suf">kg</span>} aria-label="weight" />);
    expect(screen.getByTestId("suf")).toBeInTheDocument();
  });

  it("leftIcon 作为 prefix 快捷方式", () => {
    render(<Input leftIcon={<span data-testid="icon">🔍</span>} aria-label="search" />);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("用户输入值", async () => {
    const user = userEvent.setup();
    render(<Input aria-label="input" />);
    const input = screen.getByRole("textbox");
    await user.type(input, "hello");
    expect(input).toHaveValue("hello");
  });

  it("disabled 属性", () => {
    render(<Input disabled aria-label="disabled" />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("自定义 className", () => {
    render(<Input className="custom" aria-label="field" />);
    expect(screen.getByRole("textbox")).toHaveClass("custom");
  });
});
