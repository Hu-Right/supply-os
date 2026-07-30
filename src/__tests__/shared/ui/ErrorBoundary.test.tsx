import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock i18next to avoid initialization issues in test environment
// isInitialized: true 让 LocaleContext 模块加载时跳过 .use().init()（barrel 引入 Pagination → @/core/i18n 后需要）
vi.mock("i18next", () => ({
  default: {
    isInitialized: true,
    getFixedT: () => (key: string) => key,
  },
  getFixedT: () => (key: string) => key,
}));

import { ErrorBoundary, setErrorReporter } from "@/shared/ui";

describe("ErrorBoundary", () => {
  it("should render children when no error", () => {
    render(
      <ErrorBoundary>
        <div>Test Content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText("Test Content")).toBeInTheDocument();
  });

  it("should render error UI when error occurs", () => {
    const ThrowError = () => {
      throw new Error("Test error");
    };

    // Suppress console.error for this test
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("errorBoundaryTitle")).toBeInTheDocument();

    vi.restoreAllMocks();
  });

  it("should display error message", () => {
    const ThrowError = () => {
      throw new Error("Custom error message");
    };

    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Custom error message/i)).toBeInTheDocument();

    vi.restoreAllMocks();
  });

  it("should show retry button for ChunkLoadError", () => {
    const ThrowChunkError = () => {
      throw new TypeError("Loading chunk abc failed");
    };

    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowChunkError />
      </ErrorBoundary>
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("errorBoundaryRetry")).toBeInTheDocument();
    // Retry button should exist
    const retryBtn = screen.getByText("errorBoundaryRetry");
    expect(retryBtn.tagName).toBe("BUTTON");

    vi.restoreAllMocks();
  });

  it("should call errorReporter when error is caught", () => {
    const reporter = vi.fn();
    setErrorReporter(reporter);

    const ThrowError = () => {
      throw new Error("Reporter test");
    };

    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(reporter).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) })
    );

    // Reset reporter
    setErrorReporter(null as any);
    vi.restoreAllMocks();
  });

  it("should render custom fallback when provided", () => {
    const ThrowError = () => {
      throw new Error("Fallback test");
    };

    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={<div>Custom Fallback</div>}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText("Custom Fallback")).toBeInTheDocument();

    vi.restoreAllMocks();
  });
});
