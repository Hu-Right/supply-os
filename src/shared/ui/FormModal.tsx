/**
 * 表单弹窗外壳
 * Form Modal Shell (shadcn/ui pattern)
 *
 * @module shared/ui/FormModal
 * @description 封装 4 个重复弹窗的共通结构：深色头部 + submitted 切换 + 页脚。
 *              消除每个弹窗 ~40 行样板代码（dark header / X 按钮 / success 切换）。
 *              变体部分（头部内容、表单体、页脚、错误横幅）通过 slot prop 传入。
 *              深色头部使用负边距（-mx-4 md:-mx-6 -mt-4 md:-mt-6）撑满 Modal 的 p-4 md:p-6 内边距。
 */

import { type ReactNode } from "react";
import { X } from "lucide-react";
import { Modal } from "./Modal";
import { cn } from "@/shared/utils";

export interface FormModalProps {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** Modal 宽度覆盖（如 "max-w-2xl"） */
  className?: string;
  /** 头部标题 */
  title: ReactNode;
  /** 头部副标题 */
  subtitle?: ReactNode;
  /** 头部额外内容（徽章等，渲染在标题上方） */
  headerExtra?: ReactNode;
  /** 头部样式覆盖（渐变、padding 等） */
  headerClassName?: string;
  /** 头部对齐方式（默认 center） */
  headerAlign?: "center" | "start";
  /** 是否已提交（显示成功视图） */
  submitted: boolean;
  /** 成功视图内容（包裹在 p-8 text-center 中） */
  successView: ReactNode;
  /** 表单体（未提交时显示） */
  children: ReactNode;
  /** 表单体容器样式（如滚动 "max-h-[60vh] overflow-y-auto"） */
  bodyClassName?: string;
  /** 错误横幅（渲染在页脚上方） */
  error?: ReactNode;
  /** 页脚（取消/提交按钮等） */
  footer?: ReactNode;
}

export function FormModal({
  open,
  onClose,
  className,
  title,
  subtitle,
  headerExtra,
  headerClassName,
  headerAlign = "center",
  submitted,
  successView,
  children,
  bodyClassName,
  error,
  footer,
}: FormModalProps) {
  return (
    <Modal open={open} onClose={onClose} showClose={false} className={className}>
      {/* 深色头部：负边距撑满 Modal 内边距 */}
      <div
        className={cn(
          "bg-secondary-900 text-white p-4 flex justify-between rounded-t-2xl",
          "-mx-4 md:-mx-6 -mt-4 md:-mt-6 mb-4 md:mb-6",
          headerAlign === "start" ? "items-start" : "items-center",
          headerClassName,
        )}
      >
        <div>
          {headerExtra}
          <h3 className="text-base font-extrabold">{title}</h3>
          {subtitle && (
            <p className="text-2xs text-secondary-400 mt-1">{subtitle}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-secondary-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 主体：submitted → 成功视图，否则表单体 */}
      {submitted ? (
        <div className="p-8 text-center">{successView}</div>
      ) : (
        <div className={cn(bodyClassName)}>{children}</div>
      )}

      {/* 错误横幅 */}
      {error}

      {/* 页脚 */}
      {footer}
    </Modal>
  );
}

FormModal.displayName = "FormModal";
