"use client";

/**
 * 字段级提示气泡
 * Field-level hint tooltip
 *
 * @module shared/ui/FieldHintTooltip
 * @description 统一的「ⓘ + 悬浮说明」触发控件，供表单字段标题旁复用。
 *              基于 Radix Tooltip：鼠标悬停与键盘聚焦均可触发，Portal 渲染，
 *              自带 aria 语义。说明文字不再常驻占位，界面更紧凑；
 *              警告、错误、状态反馈与流程指引不属于此类，不应使用本组件。
 *
 *              label 必须传本地化后的字段标题（无障碍标签），
 *              禁止在组件内硬编码界面文案（check-i18n-ui 门禁）。
 */

import { type ReactNode } from "react";
import { Tooltip } from "./Tooltip";
import { cn } from "@/shared/utils";

export interface FieldHintTooltipProps {
  /** 提示内容（通常为已本地化的 t(...) 结果） */
  content: ReactNode;
  /** 触发按钮的无障碍标签，传字段标题的本地化文案 */
  label: string;
  className?: string;
}

export function FieldHintTooltip({ content, label, className }: FieldHintTooltipProps) {
  return (
    <Tooltip side="top" align="start" className="max-w-xs leading-relaxed" content={content}>
      <button
        type="button"
        aria-label={label}
        className={cn(
          "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-secondary-300 text-[11px] leading-none text-secondary-400",
          "hover:border-teal-500 hover:text-teal-600 focus:ring-1 focus:ring-teal-500",
          className,
        )}
      >
        i
      </button>
    </Tooltip>
  );
}

FieldHintTooltip.displayName = "FieldHintTooltip";
