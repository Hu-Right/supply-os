import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { useScrollLock } from "@/shared/ui";

// 说明：useScrollLock 使用模块级引用计数（lockCount），
// 各用例必须保证自己挂载的 Locker 全部卸载后再结束，避免污染后续用例。
function Locker({ active = true }: { active?: boolean }) {
  useScrollLock(active);
  return null;
}

describe("useScrollLock", () => {
  it("locks body scroll on mount and restores on unmount", () => {
    const { unmount } = render(<Locker />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps lock until all stacked lockers unmount (ref count)", () => {
    const first = render(<Locker />);
    const second = render(<Locker />);
    first.unmount();
    // 仍有一个弹窗在场：锁不释放
    expect(document.body.style.overflow).toBe("hidden");
    second.unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("does nothing when active=false", () => {
    const { unmount } = render(<Locker active={false} />);
    expect(document.body.style.overflow).toBe("");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("locks when active flips from false to true and unlocks on flip back", () => {
    const { rerender, unmount } = render(<Locker active={false} />);
    expect(document.body.style.overflow).toBe("");
    rerender(<Locker active={true} />);
    expect(document.body.style.overflow).toBe("hidden");
    rerender(<Locker active={false} />);
    expect(document.body.style.overflow).toBe("");
    unmount();
  });

  it("restores a pre-existing inline overflow value instead of clearing it", () => {
    document.body.style.overflow = "scroll";
    const { unmount } = render(<Locker />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("scroll");
    document.body.style.overflow = "";
  });
});
