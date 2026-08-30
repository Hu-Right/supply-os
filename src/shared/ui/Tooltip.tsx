/**
 * 工具提示组件
 * Tooltip Component (Radix Tooltip)
 *
 * @module shared/ui/Tooltip
 * @description 轻量级上下文提示，基于 @radix-ui/react-tooltip。
 *              Radix 内置：延迟显示、焦点触发、Portal 渲染、ARIA 语义。
 *              用法：用 <Tooltip content="..."> 包裹目标元素即可。
 */

import { type ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/shared/utils";

export interface TooltipProps {
  /** 提示内容 */
  content: ReactNode;
  /** 子元素（触发元素） */
  children: ReactNode;
  /** 显示方向 */
  side?: "top" | "right" | "bottom" | "left";
  /** 对齐方式 */
  align?: "start" | "center" | "end";
  /** 显示延迟（毫秒） */
  delayDuration?: number;
  /** 自定义类名 */
  className?: string;
}

export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  delayDuration = 200,
  className,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            align={align}
            sideOffset={4}
            className={cn(
              "z-50 overflow-hidden rounded-md border border-secondary-200 bg-white px-3 py-1.5 text-xs text-secondary-700 shadow-md",
              "animate-fade-in",
              className,
            )}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-white" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

Tooltip.displayName = "Tooltip";
