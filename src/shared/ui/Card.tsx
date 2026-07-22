/**
 * 卡片组件
 * Card Component
 *
 * @module shared/ui/Card
 * @description 通用卡片容器
 *              Generic card container
 */

import { type ReactNode } from "react";

export interface CardProps {
  /** 子元素 */
  children: ReactNode;
  /** 自定义类名 */
  className?: string;
  /** 是否可点击 */
  onClick?: () => void;
}

export function Card({ children, className = "", onClick }: CardProps) {
  const baseClasses =
    "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";

  const clickableClasses = onClick
    ? "cursor-pointer transition-shadow hover:shadow-md"
    : "";

  return (
    <div
      className={`${baseClasses} ${clickableClasses} ${className}`}
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
    >
      {children}
    </div>
  );
}

Card.displayName = "Card";
