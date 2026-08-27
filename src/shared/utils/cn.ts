/**
 * className 合并工具
 * cn Utility (clsx + tailwind-merge)
 *
 * @module shared/utils/cn
 * @description 统一的 className 合并入口：clsx 处理条件类名，
 *              tailwind-merge 去重冲突的 Tailwind 工具类。
 *              所有 shared/ui 组件通过此函数合并 className，
 *              替代散落各处的直接 twMerge 调用。
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
