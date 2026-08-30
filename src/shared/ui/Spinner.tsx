/**
 * 加载指示器组件
 * Spinner Component
 *
 * @module shared/ui/Spinner
 * @description 加载动画，role="status"，aria-label 走 i18n
 *              Loading animation, role="status", aria-label via i18n
 */
import { useLocale } from "@/core/i18n";

export interface SpinnerProps {
  /** 尺寸 */
  size?: "sm" | "md" | "lg";
  /** 自定义类名 */
  className?: string;
}

const sizeClasses: Record<string, string> = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

export function Spinner({ size = "md", className = "" }: SpinnerProps) {
  const { t } = useLocale();
  return (
    <div
      role="status"
      aria-label={t("uiLoading")}
      className={`inline-flex items-center justify-center ${className}`}
    >
      <svg
        className={`animate-spin text-primary-600 ${sizeClasses[size]}`}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <span className="sr-only">{t("uiLoading")}</span>
    </div>
  );
}

Spinner.displayName = "Spinner";
