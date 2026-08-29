/**
 * 确认弹窗组件
 * Confirm Dialog Component
 *
 * @module shared/ui/ConfirmDialog
 * @description 通用二次确认弹窗，基于 Modal 封装。
 *              支持自定义标题/描述/按钮文案/配色。
 */

import { useLocale } from "@/core/i18n";
import { Button } from "./Button";
import { Modal } from "./Modal";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 确认按钮风格 */
  variant?: "primary" | "danger";
  /** 确认按钮是否加载中 */
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = "primary",
  loading = false,
}: ConfirmDialogProps) {
  const { t } = useLocale();

  return (
    <Modal open={open} onClose={onClose} title={title ?? t("confirmTitle")}>
      <div className="space-y-4">
        {description && (
          <p className="text-sm text-slate-600">{description}</p>
        )}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel ?? t("confirmCancel")}
          </Button>
          <Button
            type="button"
            variant={variant === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? t("confirmLoading") : (confirmLabel ?? t("confirmOk"))}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

ConfirmDialog.displayName = "ConfirmDialog";
