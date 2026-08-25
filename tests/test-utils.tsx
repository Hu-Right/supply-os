/**
 * 组件测试公共工具
 * Shared utilities for React component testing
 *
 * @description @/core/i18n 的全局 mock 已在 src/__tests__/setup.ts 中配置。
 *              本文件提供 render 封装等辅助函数。
 */
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";

/**
 * 渲染组件（带 providers）
 * 当前等价于直接 render，后续如需添加全局 Provider 在此扩展
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(ui, options);
}
