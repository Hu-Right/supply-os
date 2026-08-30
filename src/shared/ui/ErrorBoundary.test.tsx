import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary, setErrorReporter } from "./ErrorBoundary";

// Mock i18next（ErrorBoundary 直接 import i18next）
vi.mock("i18next", () => ({
  default: {
    language: "en",
    getFixedT: () => (key: string) => key,
  },
  getFixedT: () => (key: string) => key,
}));

// 触发渲染错误的子组件
function ThrowError({ message }: { message: string }): never {
  throw new Error(message);
}

describe("ErrorBoundary", () => {
  it("正常渲染子元素（无错误时）", () => {
    render(
      <ErrorBoundary>
        <div>正常内容</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("正常内容")).toBeInTheDocument();
  });

  it("子组件抛错 → 显示错误边界 UI（role=alert）", () => {
    // 抑制 React 的 console.error 输出
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ThrowError message="测试错误" />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("子组件抛错 → 显示错误消息", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ThrowError message="具体错误信息" />
      </ErrorBoundary>,
    );
    expect(screen.getByText("具体错误信息")).toBeInTheDocument();
  });

  it("自定义 fallback → 渲染 fallback 而非默认 UI", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={<div>自定义降级</div>}>
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
      <ErrorBoundary>
        <ThrowChunkError />
      </ErrorBoundary>,
    );
    // errorBoundaryRetry 翻译键由 mock 返回原文
    expect(screen.getByText("errorBoundaryRetry")).toBeInTheDocument();
  });

  it("setErrorReporter → 错误时调用 reporter", () => {
    const reporter = vi.fn();
    setErrorReporter(reporter);
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ThrowError message="上报测试" />
      </ErrorBoundary>,
    );
    expect(reporter).toHaveBeenCalledOnce();
    expect(reporter.mock.calls[0][0].message).toBe("上报测试");
  });
});
