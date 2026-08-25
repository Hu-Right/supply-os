/**
 * shared/ui/ErrorBoundary 组件测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// mock i18next（ErrorBoundary 直接导入 i18next，不走 @/core/i18n）
vi.mock("i18next", () => {
  const t = (key: string) => key;
  return {
    default: {
      language: "en",
      getFixedT: () => t,
    },
  };
});

import { ErrorBoundary, setErrorReporter } from "@/shared/ui/ErrorBoundary";

/** 渲染时抛错的辅助组件 */
function ThrowError({ error }: { error: Error }): never {
  throw error;
}

describe("ErrorBoundary", () => {
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    consoleSpy.mockClear();
  });

  afterEach(() => {
    consoleSpy.mockClear();
  });

  it("无错误时渲染 children", () => {
    render(
      <ErrorBoundary>
        <div>Hello</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("捕获渲染错误并显示 fallback", () => {
    render(
      <ErrorBoundary>
        <ThrowError error={new Error("test error")} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("errorBoundaryTitle")).toBeInTheDocument();
  });

  it("调用 errorReporter", () => {
    const reporter = vi.fn();
    setErrorReporter(reporter);
    render(
      <ErrorBoundary>
        <ThrowError error={new Error("report me")} />
      </ErrorBoundary>,
    );
    expect(reporter).toHaveBeenCalled();
    setErrorReporter(null as any);
  });

  it("ChunkLoadError → 显示重试按钮", async () => {
    const reloadFn = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload: reloadFn, href: "" },
      writable: true,
    });

    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <ThrowError error={new TypeError("Loading chunk 42 failed")} />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    const retryBtn = screen.getByText("errorBoundaryRetry");
    expect(retryBtn).toBeInTheDocument();

    await user.click(retryBtn);
    expect(reloadFn).toHaveBeenCalled();
  });

  it("普通错误 → 显示返回首页按钮", async () => {
    const hrefSetter = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload: vi.fn(), get href() { return ""; }, set href(v) { hrefSetter(v); } },
      writable: true,
    });

    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <ThrowError error={new Error("some error")} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("errorBoundaryTitle")).toBeInTheDocument();
    expect(screen.getByText("errorBoundaryBackHome")).toBeInTheDocument();

    await user.click(screen.getByText("errorBoundaryBackHome"));
    expect(hrefSetter).toHaveBeenCalledWith("/showroom");
  });

  it("自定义 fallback 优先", () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowError error={new Error("err")} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Custom fallback")).toBeInTheDocument();
  });

  it("显示错误信息 pre", () => {
    render(
      <ErrorBoundary>
        <ThrowError error={new Error("debug info")} />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/debug info/)).toBeInTheDocument();
  });
});
