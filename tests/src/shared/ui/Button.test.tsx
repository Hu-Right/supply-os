/**
 * shared/ui/Button 组件测试
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@/shared/ui/Button";

describe("Button", () => {
  it("渲染 children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: /click me/i })).toBeInTheDocument();
  });

  it("默认 variant=primary", () => {
    render(<Button>Primary</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-teal-600");
  });

  it("variant=secondary", () => {
    render(<Button variant="secondary">Sec</Button>);
    expect(screen.getByRole("button").className).toContain("bg-slate-100");
  });

  it("variant=ghost", () => {
    render(<Button variant="ghost">Ghost</Button>);
    expect(screen.getByRole("button").className).toContain("bg-transparent");
  });

  it("variant=danger", () => {
    render(<Button variant="danger">Del</Button>);
    expect(screen.getByRole("button").className).toContain("bg-rose-600");
  });

  it("size=sm 使用小尺寸样式", () => {
    render(<Button size="sm">Small</Button>);
    expect(screen.getByRole("button").className).toContain("px-3");
  });

  it("size=lg 使用大尺寸样式", () => {
    render(<Button size="lg">Large</Button>);
    expect(screen.getByRole("button").className).toContain("px-6");
  });

  it("loading 时 disabled + 显示 spinner", () => {
    render(<Button loading>Submit</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn.querySelector("svg.animate-spin")).toBeTruthy();
  });

  it("disabled 属性透传", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("点击触发 onClick", async () => {
    const user = userEvent.setup();
    let clicked = false;
    render(<Button onClick={() => { clicked = true; }}>Go</Button>);
    await user.click(screen.getByRole("button"));
    expect(clicked).toBe(true);
  });

  it("loading 时点击无效（disabled）", async () => {
    const user = userEvent.setup();
    let clicked = false;
    render(<Button loading onClick={() => { clicked = true; }}>Go</Button>);
    await user.click(screen.getByRole("button"));
    expect(clicked).toBe(false);
  });

  it("自定义 className 合并", () => {
    render(<Button className="extra-class">Btn</Button>);
    expect(screen.getByRole("button").className).toContain("extra-class");
  });
});
