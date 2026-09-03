import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchInput } from "@/shared/ui/SearchInput";

describe("SearchInput", () => {
  it("渲染搜索输入框（type=search）", () => {
    render(<SearchInput />);
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });

  it("placeholder 正确传递", () => {
    render(<SearchInput placeholder="搜索公告..." />);
    expect(screen.getByPlaceholderText("搜索公告...")).toBeInTheDocument();
  });

  it("输入触发 onChange", () => {
    const onChange = vi.fn();
    render(<SearchInput onChange={onChange} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "construction" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("搜索图标 aria-hidden=true（对屏幕阅读器不可见）", () => {
    const { container } = render(<SearchInput />);
    // Search icon SVG 应带 aria-hidden
    const svg = container.querySelector("svg[aria-hidden='true']");
    expect(svg).toBeInTheDocument();
  });

  it("自定义 className 被合并", () => {
    render(<SearchInput className="custom-search" />);
    const input = screen.getByRole("searchbox");
    expect(input.className).toContain("custom-search");
  });

  it("disabled 状态正确传递", () => {
    render(<SearchInput disabled />);
    expect(screen.getByRole("searchbox")).toBeDisabled();
  });
});
