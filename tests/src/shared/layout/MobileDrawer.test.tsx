/**
 * shared/layout/MobileDrawer 组件测试
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MobileDrawer } from "@/shared/layout/MobileDrawer";

// mock useLocation（覆盖全局 mock 以支持 active 判断）
vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: "/showroom", search: "", hash: "", state: null, key: "" }),
  useNavigate: () => vi.fn(),
  Navigate: () => null,
}));

describe("MobileDrawer", () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
  };

  it("open=true 时渲染", () => {
    render(<MobileDrawer {...defaultProps} />);
    expect(screen.getByText("brandName")).toBeInTheDocument();
  });

  it("open=false 时不渲染", () => {
    render(<MobileDrawer {...defaultProps} open={false} />);
    expect(screen.queryByText("brandName")).not.toBeInTheDocument();
  });

  it("点击遮罩 → onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<MobileDrawer open onClose={onClose} />);
    // 遮罩是第一个 absolute div
    const backdrop = document.querySelector(".bg-slate-900\\/50")!;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("点击关闭按钮 → onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<MobileDrawer open onClose={onClose} />);
    // 关闭按钮是抽屉头部里的 button（含 X icon）
    const buttons = screen.getAllByRole("button");
    // 第一个 button 是关闭按钮（头部 X）
    await user.click(buttons[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it("显示 guestLevel 当未登录", () => {
    render(<MobileDrawer {...defaultProps} />);
    expect(screen.getByText("guestLevel")).toBeInTheDocument();
  });
});
