import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock i18n：Pagination 使用 useLocale().t()
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "en" }),
}));

import { Pagination } from "@/shared/ui/Pagination";

describe("Pagination", () => {
  const defaultProps = {
    page: 3,
    totalPages: 10,
    serverPageSize: 10,
    total: 100,
    loading: false,
    onPageChange: vi.fn(),
  };

  it("渲染上一页/下一页按钮", () => {
    render(<Pagination {...defaultProps} />);
    // t("procurement_prev") → "procurement_prev"（mock 返回 key）
    expect(screen.getByText("procurement_prev")).toBeInTheDocument();
    expect(screen.getByText("procurement_next")).toBeInTheDocument();
  });

  it("点击下一页 → onPageChange(page+1)", () => {
    const onPageChange = vi.fn();
    render(<Pagination {...defaultProps} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByText("procurement_next"));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it("点击上一页 → onPageChange(page-1)", () => {
    const onPageChange = vi.fn();
    render(<Pagination {...defaultProps} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByText("procurement_prev"));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("第一页时上一页按钮禁用", () => {
    render(<Pagination {...defaultProps} page={1} />);
    const prevBtn = screen.getByText("procurement_prev").closest("button");
    expect(prevBtn).toBeDisabled();
  });

  it("最后一页时下一页按钮禁用", () => {
    render(<Pagination {...defaultProps} page={10} />);
    const nextBtn = screen.getByText("procurement_next").closest("button");
    expect(nextBtn).toBeDisabled();
  });

  it("loading 时所有按钮禁用", () => {
    render(<Pagination {...defaultProps} loading />);
    screen.getAllByRole("button").forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  it("页码跳转：输入有效页码 + Enter → onPageChange", () => {
    const onPageChange = vi.fn();
    render(<Pagination {...defaultProps} onPageChange={onPageChange} />);
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPageChange).toHaveBeenCalledWith(7);
  });

  it("页码跳转：超出范围不触发", () => {
    const onPageChange = vi.fn();
    render(<Pagination {...defaultProps} onPageChange={onPageChange} />);
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "999" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("自定义 labels 覆盖默认文案", () => {
    render(<Pagination {...defaultProps} labels={{ prev: "Previous", next: "Next" }} />);
    expect(screen.getByText("Previous")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
  });
});
