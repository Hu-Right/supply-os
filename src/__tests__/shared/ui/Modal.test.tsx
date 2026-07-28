import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Modal } from "@/shared/ui";

describe("Modal", () => {
  it("renders nothing when open=false", () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}}>
        <p>Hidden</p>
      </Modal>
    );
    expect(container.querySelector("dialog")).toBeNull();
  });

  it("renders children when open=true", () => {
    render(
      <Modal open={true} onClose={() => {}}>
        <p>Visible Content</p>
      </Modal>
    );
    expect(screen.getByText("Visible Content")).toBeInTheDocument();
  });

  it("has role=dialog and aria-modal=true", () => {
    render(
      <Modal open={true} onClose={() => {}}>
        <p>Content</p>
      </Modal>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("renders title when provided", () => {
    render(
      <Modal open={true} onClose={() => {}} title="My Title">
        <p>Content</p>
      </Modal>
    );
    expect(screen.getByText("My Title")).toBeInTheDocument();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose}>
        <p>Content</p>
      </Modal>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose}>
        <p>Content</p>
      </Modal>
    );
    const closeBtn = screen.getByLabelText("关闭");
    closeBtn.click();
    expect(onClose).toHaveBeenCalled();
  });

  it("hides close button when showClose=false", () => {
    render(
      <Modal open={true} onClose={() => {}} showClose={false}>
        <p>Content</p>
      </Modal>
    );
    expect(screen.queryByLabelText("关闭")).toBeNull();
  });

  it("locks body scroll while open and restores on unmount", () => {
    const { unmount } = render(
      <Modal open={true} onClose={() => {}}>
        <p>Content</p>
      </Modal>
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("does not lock body scroll when open=false", () => {
    render(
      <Modal open={false} onClose={() => {}}>
        <p>Content</p>
      </Modal>
    );
    expect(document.body.style.overflow).toBe("");
  });

  it("moves focus into the dialog panel when opened and returns it on close", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(
      <Modal open={true} onClose={() => {}}>
        <p>Content</p>
      </Modal>
    );
    // 打开：焦点进入弹窗面板（dialog 内部）
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);

    // 关闭（卸载）：焦点归还触发元素
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
