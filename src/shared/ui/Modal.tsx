/**
 * 弹窗组件
 * Modal Component
 *
 * @module shared/ui/Modal
 * @description 通用弹窗，支持 Escape 关闭、role="dialog"、aria-modal="true"
 *              Generic modal, supports Escape close, role="dialog", aria-modal="true"
 */

import { type ReactNode, useEffect, useRef, useState, useCallback } from "react";
import { X } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useScrollLock } from "./useScrollLock";

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
  /** 自定义类名 */
  className?: string;
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
  className = "",
  closeOnBackdrop = true,
  closeOnEsc = true,
  closeOnDrag = true,
}: ModalProps) {
  const { t } = useLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // 打开期间锁定背景滚动（关闭/卸载自动恢复）
  useScrollLock(open);

  // 焦点管理：打开时聚焦弹窗面板（ESC/Tab 立即可用），关闭时归还触发元素
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, [open]);

  // P2-5 移动端修复：下拉拖拽关闭手势
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
    if (closeOnDrag && dragOffset > 120) {
      onClose();
    }
    setDragOffset(0);
  }, [dragOffset, onClose, closeOnDrag]);

  // Escape 关闭
  useEffect(() => {
    if (!open || !closeOnEsc) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, closeOnEsc]);

  // 点击遮罩关闭
  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (closeOnBackdrop && e.target === dialogRef.current) {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      open={open}
      onClick={handleBackdropClick}
      // 显式 w/h/m/max 覆盖 <dialog> 的 UA 默认样式（width/height: fit-content、margin: auto），
      // 否则容器收缩为内容大小贴靠左上角，flex 居中与全屏遮罩全部失效；
      // 遮罩底色与项目其他弹窗（AuthModal/PaymentModal/ConsultForm 等）对齐
      className="fixed inset-0 z-50 m-0 h-full w-full max-h-none max-w-none flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`relative w-full max-w-lg p-4 md:p-6 rounded-2xl border border-slate-200 bg-white shadow-xl focus:outline-none transition-transform ${className}`}
        style={{ transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined }}
      >
        {showClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute end-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            aria-label={t("uiClose")}
          >
            <X className="h-5 w-5" />
          </button>
        )}
        {title && (
          <h2 className="mb-4 text-lg font-bold text-slate-900">{title}</h2>
        )}
        {children}
      </div>
    </dialog>
  );
}

Modal.displayName = "Modal";
