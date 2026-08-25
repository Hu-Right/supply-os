/**
 * shared/ui/Modal 组件测试
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "@/shared/ui/Modal";

describe("Modal", () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    title: "Test Modal",
    children: <p>Modal content</p>,
  };

  it("open=true 时渲染 dialog", () => {
    render(<Modal {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("open=false 时不渲染", () => {
    render(<Modal {...defaultProps} open={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("显示标题", () => {
    render(<Modal {...defaultProps} />);
    expect(screen.getByText("Test Modal")).toBeInTheDocument();
  });

  it("显示子元素", () => {
    render(<Modal {...defaultProps} />);
    expect(screen.getByText("Modal content")).toBeInTheDocument();
  });

  it("showClose=true 时显示关闭按钮", () => {
    render(<Modal {...defaultProps} />);
    expect(screen.getByLabelText("uiClose")).toBeInTheDocument();
  });

  it("showClose=false 时隐藏关闭按钮", () => {
    render(<Modal {...defaultProps} showClose={false} />);
    expect(screen.queryByLabelText("uiClose")).not.toBeInTheDocument();
  });

  it("点击关闭按钮 → onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal {...defaultProps} onClose={onClose} />);
    await user.click(screen.getByLabelText("uiClose"));
    expect(onClose).toHaveBeenCalled();
  });

  it("ESC 键 → onClose", () => {
    const onClose = vi.fn();
    render(<Modal {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("closeOnEsc=false 时 ESC 不触发 onClose", () => {
    const onClose = vi.fn();
    render(<Modal {...defaultProps} onClose={onClose} closeOnEsc={false} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("role=dialog + aria-modal=true", () => {
    render(<Modal {...defaultProps} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("open=true 时锁定 body 滚动", () => {
    render(<Modal {...defaultProps} />);
    expect(document.body.style.overflow).toBe("hidden");
  });
});
