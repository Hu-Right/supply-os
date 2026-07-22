/**
 * 错误边界组件
 * Error Boundary Component
 *
 * @module shared/ui/ErrorBoundary
 * @description 错误边界，检测 ChunkLoadError 显示重试按钮
 *              Error boundary, detects ChunkLoadError and shows retry button
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

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
        return (
          <div
            role="alert"
            className="flex min-h-screen items-center justify-center bg-slate-50 p-6"
          >
            <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
              <h1 className="text-lg font-bold text-slate-900">
                网络波动导致资源加载失败
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                请检查网络连接后重试
              </p>
              <button
                type="button"
                onClick={this.handleRetry}
                className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
              >
                重新加载
              </button>
            </div>
          </div>
        );
      }

      return (
        <div
          role="alert"
          className="flex min-h-screen items-center justify-center bg-slate-50 p-6"
        >
          <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-teal-600">
              Supply OS
            </p>
            <h1 className="mt-2 text-xl font-extrabold text-slate-900">
              页面渲染异常
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              当前页面组件加载失败，已阻止整站白屏。请刷新页面或返回首页重试。
            </p>
            {this.state.error && (
              <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-slate-100 p-3 text-xs text-slate-600">
                {this.state.error.message}
              </pre>
            )}
            <button
              type="button"
              onClick={() => {
                window.location.href = "/showroom";
              }}
              className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
            >
              返回首页
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
