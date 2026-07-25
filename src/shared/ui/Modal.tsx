/**
 * 弹窗组件
 * Modal Component
 *
 * @module shared/ui/Modal
 * @description 通用弹窗，支持 Escape 关闭、role="dialog"、aria-modal="true"
 *              Generic modal, supports Escape close, role="dialog", aria-modal="true"
 */

import { type ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";

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
}

export function Modal({
  open,
  onClose,
  title,
  children,
  showClose = true,
  className = "",
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Escape 关闭
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // 点击遮罩关闭
  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      open={open}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop:bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl ${className}`}
      >
        {showClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            aria-label="关闭"
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
