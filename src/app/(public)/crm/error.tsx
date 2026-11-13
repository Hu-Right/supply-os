"use client";

/**
 * 路由错误态：CRM 加载失败
 * Route-level error boundary — /crm
 *
 * @description 呈现层统一走 shared/ui/RouteErrorState（标题/说明取 i18n 键），
 *              本文件只负责挂路由名与错误日志，不再写死中文文案。
 */
import { RouteErrorState } from "@/shared/ui/RouteErrorState";

export default function CrmError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[CrmError]", error);
  return (
    <RouteErrorState
      titleKey="errCrmTitle"
      descKey="errCrmDesc"
      onReset={reset}
    />
  );
}
