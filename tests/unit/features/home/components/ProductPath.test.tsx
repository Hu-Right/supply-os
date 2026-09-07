import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductPath } from "@/features/home/components/ProductPath";

describe("ProductPath", () => {
  it("渲染 4 步路径标题", () => {
    render(<ProductPath />);
    expect(screen.getByText("从找标到中标，只需 4 步")).toBeInTheDocument();
  });

  it("4 步名称均可展示", () => {
    render(<ProductPath />);
    expect(screen.getByText("发现机会")).toBeInTheDocument();
    expect(screen.getByText("AI 评估")).toBeInTheDocument();
    expect(screen.getByText("投标服务")).toBeInTheDocument();
    expect(screen.getByText("履约保障")).toBeInTheDocument();
  });

  it("每步都是可点击的链接", () => {
    render(<ProductPath />);
    const links = screen.getAllByRole("link");
    // 4 步 + 可能的连接线不影响链接数
    expect(links.length).toBeGreaterThanOrEqual(4);
  });

  it("步骤编号 01-04 可见", () => {
    render(<ProductPath />);
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
    expect(screen.getByText("04")).toBeInTheDocument();
  });
});
