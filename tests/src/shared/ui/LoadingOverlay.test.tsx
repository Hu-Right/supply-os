/**
 * shared/ui/LoadingOverlay 组件测试
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { LoadingOverlay } from "@/shared/ui/LoadingOverlay";

describe("LoadingOverlay", () => {
  it("visible=true 时 opacity-100 + aria-hidden=false", () => {
    const { container } = render(<LoadingOverlay visible />);
    const overlay = container.firstChild as HTMLElement;
    expect(overlay.className).toContain("opacity-100");
    expect(overlay).toHaveAttribute("aria-hidden", "false");
  });

  it("visible=false 时 opacity-0 + aria-hidden=true", () => {
    const { container } = render(<LoadingOverlay visible={false} />);
    const overlay = container.firstChild as HTMLElement;
    expect(overlay.className).toContain("opacity-0");
    expect(overlay).toHaveAttribute("aria-hidden", "true");
  });

  it("visible=true 时锁定 body 滚动", () => {
    render(<LoadingOverlay visible />);
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("卸载后恢复 body 滚动", () => {
    const { unmount } = render(<LoadingOverlay visible />);
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("显示 loading 文本", () => {
    const { container } = render(<LoadingOverlay visible />);
    expect(container.textContent).toContain("procurement_loading");
  });
});
