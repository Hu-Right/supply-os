/**
 * 通用 UI 组件入口
 * Shared UI Components Entry Point
 *
 * @module shared/ui
 * @description 原子化通用组件统一导出
 *              Unified exports for atomic UI components
 */

export { Button, buttonVariants } from "./Button";
export type { ButtonProps } from "./Button";

// ── 选择器控件（ADR-0005 豁免类的正解）──
export { SegmentedControl } from "./SegmentedControl";
export type { SegmentedControlProps, SegmentedControlItem } from "./SegmentedControl";

export { ChipToggleGroup } from "./ChipToggleGroup";
export type { ChipToggleGroupProps, ChipToggleItem } from "./ChipToggleGroup";

export { SelectableCard } from "./SelectableCard";
export type { SelectableCardProps } from "./SelectableCard";

export { ToggleButton } from "./ToggleButton";
export type { ToggleButtonProps } from "./ToggleButton";

export { Input } from "./Input";
export type { InputProps } from "./Input";

export { Textarea } from "./Textarea";
export type { TextareaProps } from "./Textarea";

export { Select } from "./Select";
export type { SelectProps } from "./Select";

export { Modal } from "./Modal";
export type { ModalProps } from "./Modal";

export { FormModal } from "./FormModal";
export type { FormModalProps } from "./FormModal";

export { Badge } from "./Badge";
export type { BadgeProps } from "./Badge";

export { Card } from "./Card";
export type { CardProps } from "./Card";

export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";

export { Spinner } from "./Spinner";
export type { SpinnerProps } from "./Spinner";

export { ErrorBoundary, setErrorReporter } from "./ErrorBoundary";
export type { ErrorBoundaryProps } from "./ErrorBoundary";

export { Pagination } from "./Pagination";
export type { PaginationProps, PaginationLabels } from "./Pagination";

export { ListPage } from "./ListPage";
export type { ListPageProps } from "./ListPage";

export { Combobox } from "./Combobox";
export type { ComboboxProps, ComboboxItem } from "./Combobox";

// react-hook-form 表单组件集：从 "@/shared/ui/Form" 子路径导入，
// 避免与 shared/forms 的 FormField 在 shared/index.ts 产生导出歧义。
// import { Form, FormField, FormItem, ... } from "@/shared/ui/Form";

export { LoadingOverlay } from "./LoadingOverlay";
export type { LoadingOverlayProps } from "./LoadingOverlay";

export { Skeleton } from "./Skeleton";
export type { SkeletonProps } from "./Skeleton";

export { ConfirmDialog } from "./ConfirmDialog";
export type { ConfirmDialogProps } from "./ConfirmDialog";

export { Tooltip } from "./Tooltip";
export type { TooltipProps } from "./Tooltip";

export { default as WechatQRModal } from "./WechatQRModal";
export type { WechatQRModalProps } from "./WechatQRModal";
