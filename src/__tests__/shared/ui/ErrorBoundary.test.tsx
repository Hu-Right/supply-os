import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "@/shared/ui";

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
    expect(screen.getByText(/页面渲染异常/i)).toBeInTheDocument();

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
});
