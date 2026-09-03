import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "@/shared/ui/Badge";

describe("Badge", () => {
  it("渲染子元素文本", () => {
    render(<Badge>活跃</Badge>);
    expect(screen.getByText("活跃")).toBeInTheDocument();
  });

  it("默认 variant=default 包含 bg-secondary-100", () => {
    render(<Badge>默认</Badge>);
    expect(screen.getByText("默认").className).toContain("bg-secondary-100");
  });

  it("variant=success 包含 bg-success-100", () => {
    render(<Badge variant="success">成功</Badge>);
    expect(screen.getByText("成功").className).toContain("bg-success-100");
  });

  it("variant=error 包含 bg-danger-100", () => {
    render(<Badge variant="error">错误</Badge>);
    expect(screen.getByText("错误").className).toContain("bg-danger-100");
  });

  it("variant=warning 包含 bg-accent-100", () => {
    render(<Badge variant="warning">警告</Badge>);
    expect(screen.getByText("警告").className).toContain("bg-accent-100");
  });

  it("pulsate=true → role=status + animate-pulse", () => {
    render(<Badge pulsate>加载中</Badge>);
    const badge = screen.getByRole("status");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("animate-pulse");
  });

  it("pulsate=false → 无 role=status", () => {
    render(<Badge>静态</Badge>);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
