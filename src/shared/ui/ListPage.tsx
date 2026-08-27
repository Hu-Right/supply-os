/**
 * 列表页模板
 * List Page Template
 *
 * @module shared/ui/ListPage
 * @description 封装列表页的共通结构：首次加载骨架屏 + 卡片网格 + 空状态 + 分页。
 *              消费方通过 children 传入卡片、skeleton 传入骨架屏、
 *              labels 传入自有翻页文案（解耦 procurement 命名空间）。
 */

import { type ReactNode } from "react";
import { Pagination, type PaginationLabels } from "./Pagination";
import { EmptyState } from "./EmptyState";
import { cn } from "@/shared/utils";

export interface ListPageProps {
  /** 是否加载中 */
  loading: boolean;
  /** 首次加载是否完成（未完成时显示 skeleton） */
  firstLoadDone: boolean;
  /** 骨架屏内容（首次加载时显示） */
  skeleton?: ReactNode;
  /** 列表卡片（非加载时显示） */
  children: ReactNode;
  /** 数据总数（0 显示空状态） */
  total: number;
  /** 当前页码 */
  page: number;
  /** 总页数 */
  totalPages: number;
  /** 每页大小 */
  pageSize: number;
  /** 翻页回调 */
  onPageChange: (page: number) => void;
  /** 空状态文案 */
  emptyText?: string;
  /** 翻页文案（解耦 procurement 命名空间） */
  paginationLabels?: PaginationLabels;
  /** 网格容器类名覆盖（默认 3 列） */
  gridClassName?: string;
}

export function ListPage({
  loading,
  firstLoadDone,
  skeleton,
  children,
  total,
  page,
  totalPages,
  pageSize,
  onPageChange,
  emptyText,
  paginationLabels,
  gridClassName,
}: ListPageProps) {
  return (
    <>
      <div className={cn("grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3", gridClassName)}>
        {loading && !firstLoadDone && skeleton}
        {!loading && children}
      </div>

      {!loading && total === 0 && <EmptyState title={emptyText} className="mt-0" />}

      {!loading && total > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          serverPageSize={pageSize}
          total={total}
          loading={loading}
          onPageChange={onPageChange}
          labels={paginationLabels}
        />
      )}
    </>
  );
}

ListPage.displayName = "ListPage";
