/**
 * 弹窗组件
 * Modal Component (shadcn/ui pattern — Radix Dialog)
 *
 * @module shared/ui/Modal
 * @description 通用弹窗，基于 @radix-ui/react-dialog。
 *              Radix 内置：焦点陷阱、Portal 渲染、滚动锁、ARIA 语义。
 *              保留：移动端拖拽关闭手势、closeOnBackdrop/closeOnEsc/closeOnDrag 控制。
 *              ModalProps 接口与旧版完全兼容，消费方零改动。
 */

import { type CSSProperties, type ReactNode, useRef, useState, useCallback } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { cn } from "@/shared/utils";

export interface ModalProps {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 标题 */
  title?: string;
  /** 子元素 */
  children: ReactNode;
  /** 是否显示关闭按钮 */
  showClose?: boolean;
  /** 禁用右上角关闭按钮（如提交中防误关）；遮罩/Esc 关闭由调用方在 onClose 内自行闸住 */
  closeDisabled?: boolean;
  /** 自定义类名（作用于内容区） */
  className?: string;
  /** 遮罩层自定义类名 */
  overlayClassName?: string;
  /** 是否允许点击遮罩层关闭（默认 true） */
  closeOnBackdrop?: boolean;
  /** 是否允许 ESC 键关闭（默认 true） */
  closeOnEsc?: boolean;
  /** 是否允许拖拽关闭（默认 true） */
  closeOnDrag?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  showClose = true,
  closeDisabled = false,
  className,
  overlayClassName,
  closeOnBackdrop = true,
  closeOnEsc = true,
  closeOnDrag = true,
}: ModalProps) {
  const { t } = useLocale();

  // ── 移动端拖拽关闭手势 ──
  const dragStartY = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const delta = e.touches[0].clientY - dragStartY.current;
    if (delta > 0) setDragOffset(delta);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (closeOnDrag && dragOffset > 200) {
      onClose();
    }
    setDragOffset(0);
  }, [dragOffset, onClose, closeOnDrag]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={cn("modal-overlay fixed inset-0 z-50 bg-secondary-950/50 backdrop-blur-sm", overlayClassName)} />
        <DialogPrimitive.Content
          onEscapeKeyDown={closeOnEsc ? undefined : (e) => e.preventDefault()}
          onInteractOutside={closeOnBackdrop ? undefined : (e) => e.preventDefault()}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className={cn(
            "modal-content z-50 rounded-2xl border border-secondary-200 bg-white p-4 shadow-2xl shadow-secondary-950/20 focus:outline-none md:p-6",
            className,
          )}
          style={{ "--modal-drag": `${dragOffset}px` } as CSSProperties}
        >
          {/* 移动端拖拽提示条 */}
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-secondary-200 sm:hidden" aria-hidden="true" />
          {showClose && (
            <button
              type="button"
              onClick={onClose}
              disabled={closeDisabled}
              className="absolute end-4 top-4 rounded-full p-1.5 text-secondary-400 transition-colors hover:bg-secondary-100 hover:text-secondary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:pointer-events-none disabled:opacity-50"
              aria-label={t("uiClose")}
            >
              <X className="h-5 w-5" />
            </button>
          )}
          <DialogPrimitive.Title
            className={cn(title ? "mb-4 pe-10 text-lg font-bold text-secondary-900" : "sr-only")}
          >
            {title ?? "dialog"}
          </DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

Modal.displayName = "Modal";
