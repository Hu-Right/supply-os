/**
 * 错误边界组件
 * Error Boundary Component
 *
 * @module shared/ui/ErrorBoundary
 * @description 错误边界，检测 ChunkLoadError 显示重试按钮
 *              Error boundary, detects ChunkLoadError and shows retry button
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import * as i18nModule from "i18next";
import { Button } from "./Button";

const i18n = (i18nModule as any).default || i18nModule;

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  isChunkError: boolean;
}

let errorReporter: ((error: Error, errorInfo: ErrorInfo) => void) | null = null;

/**
 * 设置全局错误上报器
 * Set global error reporter
 */
export function setErrorReporter(
  reporter: (error: Error, errorInfo: ErrorInfo) => void,
) {
  errorReporter = reporter;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    isChunkError: false,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const isChunkError =
      error instanceof TypeError && /loading chunk/i.test(error.message);
    return {
      hasError: true,
      error,
      isChunkError,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] React render error:", error, errorInfo);
    if (errorReporter) {
      errorReporter(error, errorInfo);
    }
  }

  handleRetry = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      if (this.state.isChunkError) {
        const t = i18n.getFixedT(i18n.language || "en");
        return (
          <div
            role="alert"
            className="flex min-h-screen items-center justify-center bg-secondary-50 p-6"
          >
            <div className="max-w-md rounded-2xl border border-secondary-200 bg-white p-6 text-center shadow-sm">
              <h1 className="text-lg font-bold text-secondary-900">
                {t("errorBoundaryChunkTitle")}
              </h1>
              <p className="mt-2 text-sm text-secondary-500">
                {t("errorBoundaryChunkDesc")}
              </p>
              <Button
                type="button"
                variant="dark"
                onClick={this.handleRetry}
                className="mt-4 py-2"
              >
                {t("errorBoundaryRetry")}
              </Button>
            </div>
          </div>
        );
      }

      const t = i18n.getFixedT(i18n.language || "en");
      return (
        <div
          role="alert"
          className="flex min-h-screen items-center justify-center bg-secondary-50 p-6"
        >
          <div className="max-w-md rounded-2xl border border-secondary-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-primary-600">
              Supply OS
            </p>
            <h1 className="mt-2 text-xl font-extrabold text-secondary-900">
              {t("errorBoundaryTitle")}
            </h1>
            <p className="mt-2 text-sm text-secondary-500">
              {t("errorBoundaryDesc")}
            </p>
            {this.state.error && (
              <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-secondary-100 p-3 text-xs text-secondary-600">
                {this.state.error.message}
              </pre>
            )}
            <Button
              type="button"
              variant="dark"
              onClick={() => {
                window.location.href = "/showroom";
              }}
              className="mt-5 py-2"
            >
              {t("errorBoundaryBackHome")}
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
