/**
 * 异步数据三态组合件（loading / error / data）
 * DataState — unified async state wrapper
 *
 * @module shared/ui/DataState
 * @description 把「骨架加载 / 错误+重试 / 正常渲染」三种异步态收成一个声明式出口，
 *              消灭各页面手写的 animate-pulse 裸块、纯文字「加载中...」与
 *              window.location.reload() 式错误恢复三种散装做法（2026-10-30 UX 统一）。
 *
 *              组合自本库既有原语：loading 渲染 skeleton（默认三行文本骨架，可整体替换）；
 *              error 渲染 EmptyState + 重试按钮（onRetry 必传才显示按钮，文案由调用方
 *              传入翻译串——本库不依赖 i18n 层，与 EmptyState 同约定）；
 *              正常时直接渲染 children。isEmpty 可选接管空态（渲染 empty 节点而非 children）。
 *
 *              用法（页面内）：
 *                <DataState loading={loading} error={error} onRetry={refresh}
 *                           errorText={t("...")} retryText={t("...")} skeleton={<PlanCardsSkeleton/>}>
 *                  <PlanCards …/>
 *                </DataState>
 */
import type { ReactNode } from "react";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { Skeleton } from "./Skeleton";

export interface DataStateProps {
  /** true 时渲染骨架（渲染 skeleton，未传则用默认三行文本骨架） */
  loading?: boolean;
  /** 非空 = 错误态：渲染错误提示 + 重试按钮（文案须由调用方翻译） */
  error?: string | null;
  /** 错误态重试回调；提供才会显示重试按钮 */
  onRetry?: () => void;
  /** 错误态标题文案（已翻译） */
  errorText?: string;
  /** 重试按钮文案（已翻译，默认「重试」——调用方应传翻译串覆盖） */
  retryText?: string;
  /** 加载态骨架块；不传用默认三行文本骨架 */
  skeleton?: ReactNode;
  /** true 且非 loading/error 时渲染 empty 节点替代 children */
  isEmpty?: boolean;
  /** 空态节点（一般直接放 <EmptyState …/>） */
  empty?: ReactNode;
  /** 内容容器附加类名 */
  className?: string;
  children: ReactNode;
}

/** 默认加载骨架：三行渐次收窄的文本条（页头标题类布局的通用近似） */
function DefaultSkeleton() {
  return (
    <div className="space-y-2 py-1" aria-busy="true">
      <Skeleton variant="text" className="h-4 w-full" />
      <Skeleton variant="text" className="h-4 w-11/12" />
      <Skeleton variant="text" className="h-4 w-4/5" />
    </div>
  );
}

export function DataState({
  loading = false,
  error = null,
  onRetry,
  errorText,
  retryText,
  skeleton,
  isEmpty = false,
  empty,
  className,
  children,
}: DataStateProps) {
  if (loading) return <div className={className}>{skeleton ?? <DefaultSkeleton />}</div>;

  if (error) {
    return (
      <div className={className}>
        <EmptyState
          title={errorText}
          action={
            onRetry ? (
              <Button type="button" variant="primary" onClick={onRetry} className="px-4 py-2 text-sm">
                {retryText ?? "重试"}
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  if (isEmpty) return <div className={className}>{empty ?? null}</div>;

  return <div className={className}>{children}</div>;
}
