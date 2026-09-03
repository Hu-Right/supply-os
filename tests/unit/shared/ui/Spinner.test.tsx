import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock i18n：Spinner 使用 useLocale().t()
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "en" }),
}));

import { Spinner } from "@/shared/ui/Spinner";

describe("Spinner", () => {
  it("role=status → 无障碍可感知", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("包含 sr-only 文本（屏幕阅读器可读）", () => {
    render(<Spinner />);
    // t("uiLoading") 被 mock 返回 key 本身
    expect(screen.getByText("uiLoading")).toBeInTheDocument();
  });

  it("默认 size=md → h-6 w-6", () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector("svg");
    const cls = svg?.getAttribute("class") ?? "";
    expect(cls).toContain("h-6");
    expect(cls).toContain("w-6");
  });

  it("size=sm → h-4 w-4", () => {
    const { container } = render(<Spinner size="sm" />);
    const svg = container.querySelector("svg");
    const cls = svg?.getAttribute("class") ?? "";
    expect(cls).toContain("h-4");
    expect(cls).toContain("w-4");
  });

  it("size=lg → h-8 w-8", () => {
    const { container } = render(<Spinner size="lg" />);
    const svg = container.querySelector("svg");
    const cls = svg?.getAttribute("class") ?? "";
    expect(cls).toContain("h-8");
    expect(cls).toContain("w-8");
  });

  it("自定义 className 被传递", () => {
    const { container } = render(<Spinner className="my-spinner" />);
    expect(container.querySelector(".my-spinner")).toBeInTheDocument();
  });

  it("SVG 带 animate-spin 类", () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector("svg");
    const cls = svg?.getAttribute("class") ?? "";
    expect(cls).toContain("animate-spin");
  });
});
