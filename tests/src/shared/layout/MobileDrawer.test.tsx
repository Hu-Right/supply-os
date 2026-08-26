/**
 * shared/layout/MobileDrawer 组件测试
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MobileDrawer } from "@/shared/layout/MobileDrawer";

// next/navigation mock（替代原 react-router-dom mock）
vi.mock("next/navigation", () => ({
  usePathname: () => "/showroom",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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
    const backdrop = document.querySelector(".bg-slate-900\\/50")!;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("点击关闭按钮 → onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<MobileDrawer open onClose={onClose} />);
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it("显示 guestLevel 当未登录", () => {
    render(<MobileDrawer {...defaultProps} />);
    expect(screen.getByText("guestLevel")).toBeInTheDocument();
  });
});
