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

export { Input } from "./Input";
export type { InputProps } from "./Input";

export { Select } from "./Select";
export type { SelectProps } from "./Select";

export { Modal } from "./Modal";
export type { ModalProps } from "./Modal";

export { FormModal } from "./FormModal";
export type { FormModalProps } from "./FormModal";

export { useScrollLock } from "./useScrollLock";

export { Badge } from "./Badge";
export type { BadgeProps } from "./Badge";

export { Card } from "./Card";
export type { CardProps } from "./Card";

export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";

export { Spinner } from "./Spinner";
export type { SpinnerProps } from "./Spinner";

export { SearchInput } from "./SearchInput";
export type { SearchInputProps } from "./SearchInput";

export { ErrorBoundary, setErrorReporter } from "./ErrorBoundary";
export type { ErrorBoundaryProps } from "./ErrorBoundary";

export { Pagination } from "./Pagination";
export type { PaginationProps, PaginationLabels } from "./Pagination";

export { ListPage } from "./ListPage";
export type { ListPageProps } from "./ListPage";

export { LoadingOverlay } from "./LoadingOverlay";
export type { LoadingOverlayProps } from "./LoadingOverlay";
