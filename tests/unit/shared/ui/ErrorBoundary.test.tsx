import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary, setErrorReporter } from "@/shared/ui/ErrorBoundary";

// t 函数现在通过 props 注入（由 ErrorBoundaryWithI18n 包装器提供），
// 测试中直接传 t={(k) => k} 即可，不再需要 mock i18next
const mockT = (key: string) => key;

// 触发渲染错误的子组件
function ThrowError({ message }: { message: string }): never {
  throw new Error(message);
}

describe("ErrorBoundary", () => {
  it("正常渲染子元素（无错误时）", () => {
    render(
      <ErrorBoundary t={mockT}>
        <div>正常内容</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("正常内容")).toBeInTheDocument();
  });

  it("子组件抛错 → 显示错误边界 UI（role=alert）", () => {
    // 抑制 React 的 console.error 输出
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary t={mockT}>
        <ThrowError message="测试错误" />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("子组件抛错 → 显示错误消息", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary t={mockT}>
        <ThrowError message="具体错误信息" />
      </ErrorBoundary>,
    );
    expect(screen.getByText("具体错误信息")).toBeInTheDocument();
  });

  it("自定义 fallback → 渲染 fallback 而非默认 UI", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary t={mockT} fallback={<div>自定义降级</div>}>
        <ThrowError message="错误" />
      </ErrorBoundary>,
    );
    expect(screen.getByText("自定义降级")).toBeInTheDocument();
  });

  it("ChunkLoadError → 显示重试按钮", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const chunkError = new TypeError("Loading chunk 5 failed");
    function ThrowChunkError(): never {
      throw chunkError;
    }
    render(
      <ErrorBoundary t={mockT}>
        <ThrowChunkError />
      </ErrorBoundary>,
    );
    // errorBoundaryRetry 翻译键由 mock t 返回原文
    expect(screen.getByText("errorBoundaryRetry")).toBeInTheDocument();
  });

  it("setErrorReporter → 错误时调用 reporter", () => {
    const reporter = vi.fn();
    setErrorReporter(reporter);
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary t={mockT}>
        <ThrowError message="上报测试" />
      </ErrorBoundary>,
    );
    expect(reporter).toHaveBeenCalledOnce();
    expect(reporter.mock.calls[0][0].message).toBe("上报测试");
  });

  it("ChunkLoadError 点击重试按钮 → 触发整页 reload", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    const reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    function ThrowChunkError(): never {
      throw new TypeError("Loading chunk 5 failed");
    }
    render(
      <ErrorBoundary t={mockT}>
        <ThrowChunkError />
      </ErrorBoundary>,
    );
    await user.click(screen.getByText("errorBoundaryRetry"));
    expect(reloadSpy).toHaveBeenCalledOnce();
  });

  it("默认错误 UI 点击 showroom 按钮 → 跳转 /showroom", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    const hrefSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...window.location,
        reload: vi.fn(),
        get href() {
          return "http://localhost/";
        },
        set href(v: string) {
          hrefSpy(v);
        },
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary t={mockT}>
        <ThrowError message="普通错误" />
      </ErrorBoundary>,
    );
    await user.click(screen.getByText("errorBoundaryBackHome"));
    expect(hrefSpy).toHaveBeenCalledWith("/showroom");
  });
});
