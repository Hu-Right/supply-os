/**
 * 卡片组件
 * Card Component (shadcn/ui pattern)
 *
 * @module shared/ui/Card
 * @description 通用卡片容器，支持 forwardRef 和 className 正确合并。
 *              基于 shadcn/ui Card 模式，使用 cn() 工具合并类名。
 */

import { type ReactNode, forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/shared/utils";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** 子元素 */
  children: ReactNode;
  /** 是否可点击 */
  onClick?: () => void;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, className, onClick, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl border border-slate-200 bg-white p-4 shadow-sm",
          onClick && "cursor-pointer transition-shadow hover:shadow-md",
          className,
        )}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={
          onClick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
        {...props}
      >
        {children}
      </div>
    );
  },
);

Card.displayName = "Card";
