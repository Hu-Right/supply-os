/**
 * 组件渲染计时 Hook
 * Component Render Timer Hook
 *
 * @module core/perf/useRenderTimer
 * @description 使用 performance.now() 测量组件每次渲染的耗时。
 *              开发模式下自动记录到性能指标收集器（生产环境不采集、零开销）。
 *              Measures component render time using performance.now().
 *              Records to perf metrics collector in dev mode only.
 */

import { useRef, useEffect } from "react";
import { recordRenderMetric } from "./metrics";

/**
 * 测量组件渲染耗时
 *
 * @param componentName - 组件名称（用于报告标识）
 * @param deps - 依赖数组，变化时重新测量（与 useEffect 语义一致）
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   useRenderTimer("MyComponent");
 *   return <div>...</div>;
 * }
 * ```
 */
export function useRenderTimer(componentName: string, deps: unknown[] = []): void {
  const renderStartRef = useRef<number>(0);
  const isDev = process.env.NODE_ENV !== "production";

  // 在渲染开始时记录时间（useEffect 在 commit 后执行，此时渲染已完成）
  // 生产环境不调 performance.now，不记录：避免渲染阶段副作用与无消费方的采集开销
  if (isDev) renderStartRef.current = performance.now();

  useEffect(() => {
    if (!isDev) return;
    const renderMs = performance.now() - renderStartRef.current;

    // 只记录有意义的渲染（>0.1ms），过滤掉 noop 渲染
    if (renderMs > 0.1) {
      recordRenderMetric({
        component: componentName,
        renderMs: Math.round(renderMs * 100) / 100,
        timestamp: Date.now(),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
