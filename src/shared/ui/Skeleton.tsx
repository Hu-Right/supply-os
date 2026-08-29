/**
 * 骨架屏组件
 * Skeleton Loading Component
 *
 * @module shared/ui/Skeleton
 * @description 通用加载占位组件，支持多种形状预设。
 *              消费方可组合使用以构建复杂骨架布局。
 */

import { cn } from "@/shared/utils";

export interface SkeletonProps {
  /** 骨架形状预设 */
  variant?: "text" | "circular" | "rectangular" | "rounded";
  /** 宽度（CSS 值，如 '100%'、'200px'） */
  width?: string | number;
  /** 高度（CSS 值） */
  height?: string | number;
  /** 附加 className */
  className?: string;
}

const VARIANT_CLASSES: Record<string, string> = {
  text: "rounded-md",
  circular: "rounded-full",
  rectangular: "rounded-none",
  rounded: "rounded-2xl",
};

export function Skeleton({
  variant = "text",
  width,
  height,
  className,
}: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse bg-slate-200",
        VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.text,
        className,
      )}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

Skeleton.displayName = "Skeleton";
