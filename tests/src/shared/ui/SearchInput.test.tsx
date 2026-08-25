/**
 * shared/ui/SearchInput 组件测试
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchInput } from "@/shared/ui/SearchInput";

describe("SearchInput", () => {
  it("渲染 role=searchbox", () => {
    render(<SearchInput />);
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });

  it("支持 placeholder", () => {
    render(<SearchInput placeholder="Search..." />);
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });

  it("支持自定义 className", () => {
    render(<SearchInput className="custom-class" />);
    const input = screen.getByRole("searchbox");
    expect(input.className).toContain("custom-class");
  });

  it("type 为 search", () => {
    render(<SearchInput />);
    expect(screen.getByRole("searchbox")).toHaveAttribute("type", "search");
  });

  it("用户输入文本", async () => {
    const user = userEvent.setup();
    render(<SearchInput />);
    const input = screen.getByRole("searchbox");
    await user.type(input, "hello");
    expect(input).toHaveValue("hello");
  });

  it("dir=auto 支持 RTL", () => {
    render(<SearchInput />);
    expect(screen.getByRole("searchbox")).toHaveAttribute("dir", "auto");
  });
});
