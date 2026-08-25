/**
 * shared/ui/Badge 组件测试
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "@/shared/ui/Badge";

describe("Badge", () => {
  it("渲染 children", () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("默认 variant=default", () => {
    render(<Badge>Default</Badge>);
    expect(screen.getByText("Default").className).toContain("bg-slate-100");
  });

  it("variant=success", () => {
    render(<Badge variant="success">OK</Badge>);
    expect(screen.getByText("OK").className).toContain("bg-emerald-100");
  });

  it("variant=warning", () => {
    render(<Badge variant="warning">Warn</Badge>);
    expect(screen.getByText("Warn").className).toContain("bg-amber-100");
  });

  it("variant=error", () => {
    render(<Badge variant="error">Err</Badge>);
    expect(screen.getByText("Err").className).toContain("bg-rose-100");
  });

  it("variant=info", () => {
    render(<Badge variant="info">Info</Badge>);
    expect(screen.getByText("Info").className).toContain("bg-teal-100");
  });

  it("pulsate 时添加 animate-pulse + role=status", () => {
    render(<Badge pulsate>Loading</Badge>);
    const badge = screen.getByRole("status");
    expect(badge.className).toContain("animate-pulse");
  });

  it("非 pulsate 时无 role=status", () => {
    render(<Badge>Static</Badge>);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("自定义 className 合并", () => {
    render(<Badge className="custom">X</Badge>);
    expect(screen.getByText("X").className).toContain("custom");
  });
});
