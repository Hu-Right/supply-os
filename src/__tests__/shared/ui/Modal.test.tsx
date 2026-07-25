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
});
