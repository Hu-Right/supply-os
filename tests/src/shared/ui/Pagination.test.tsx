/**
 * shared/ui/Pagination 组件测试
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pagination } from "@/shared/ui/Pagination";

describe("Pagination", () => {
  const defaultProps = {
    page: 2,
    totalPages: 5,
    serverPageSize: 20,
    total: 100,
    loading: false,
    onPageChange: vi.fn(),
  };

  it("显示当前范围文本", () => {
    render(<Pagination {...defaultProps} />);
    // page=2, pageSize=20 → items 21-40
    expect(screen.getByText(/21.*40/)).toBeInTheDocument();
  });

  it("total=0 时显示无匹配", () => {
    render(<Pagination {...defaultProps} total={0} />);
    expect(screen.getByText("procurement_noMatch")).toBeInTheDocument();
  });

  it("上一页按钮 disabled 当 page=1", () => {
    render(<Pagination {...defaultProps} page={1} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toBeDisabled();
  });

  it("下一页按钮 disabled 当 page=totalPages", () => {
    render(<Pagination {...defaultProps} page={5} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons[1]).toBeDisabled();
  });

  it("点击上一页 → onPageChange(page-1)", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination {...defaultProps} onPageChange={onPageChange} />);
    await user.click(screen.getAllByRole("button")[0]);
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("点击下一页 → onPageChange(page+1)", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination {...defaultProps} onPageChange={onPageChange} />);
    await user.click(screen.getAllByRole("button")[1]);
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("loading 时两个按钮都 disabled", () => {
    render(<Pagination {...defaultProps} loading />);
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeDisabled();
  });
});
