/**
 * 卡片组件
 * Card Component (shadcn/ui pattern)
 *
 * @module shared/ui/Card
 * @description 通用卡片容器，支持 forwardRef 和 className 正确合并。
 *              基于 shadcn/ui Card 模式，使用 cn() 工具合并类名。
 *              interactive 属性控制 hover 交互效果，与 onClick 解耦。
 */

import { type ReactNode, forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/shared/utils";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** 子元素 */
  children: ReactNode;
  /** 是否可点击 */
  onClick?: () => void;
  /** 是否启用 hover 交互效果（阴影/边框高亮），默认 false。
   *  与 onClick 解耦：静态卡片也可开启 hover 视觉反馈。 */
  interactive?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, className, onClick, interactive = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl border border-secondary-200 bg-white p-4 shadow-sm",
          (interactive || onClick) && "cursor-pointer transition-all hover:border-primary-300 hover:shadow-md",
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
