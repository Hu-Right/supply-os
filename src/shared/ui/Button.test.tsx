import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "./Button";

describe("Button", () => {
  it("渲染子元素文本", () => {
    render(<Button>提交</Button>);
    expect(screen.getByRole("button", { name: "提交" })).toBeInTheDocument();
  });

  it("点击触发 onClick", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>点击</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("disabled 时不可点击", () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>禁用</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("loading 时显示 spinner 且禁用按钮", () => {
    render(<Button loading>加载中</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    // loading spinner SVG 带 aria-hidden="true"
    const spinner = btn.querySelector("svg.animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  it("默认 variant=primary 包含 bg-primary-600 类名", () => {
    render(<Button>主按钮</Button>);
    expect(screen.getByRole("button").className).toContain("bg-primary-600");
  });

  it("variant=danger 包含 bg-danger-600 类名", () => {
    render(<Button variant="danger">危险</Button>);
    expect(screen.getByRole("button").className).toContain("bg-danger-600");
  });

  it("size=sm 包含 text-xs 类名", () => {
    render(<Button size="sm">小</Button>);
    expect(screen.getByRole("button").className).toContain("text-xs");
  });

  it("size=lg 包含 text-base 类名", () => {
    render(<Button size="lg">大</Button>);
    expect(screen.getByRole("button").className).toContain("text-base");
  });

  it("自定义 className 被合并", () => {
    render(<Button className="custom-class">自定义</Button>);
    expect(screen.getByRole("button").className).toContain("custom-class");
  });

  it("透传 HTML 属性（如 type、aria-label）", () => {
    render(<Button type="submit" aria-label="提交表单">提交</Button>);
    const btn = screen.getByRole("button", { name: "提交表单" });
    expect(btn).toHaveAttribute("type", "submit");
  });
});
