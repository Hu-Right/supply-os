/**
 * 公采公告列表组件
 * Notice List
 *
 * @module features/procurement/components/NoticeList
 * @description 列表 + NoticeCard 循环 + Pagination + 空态。
 *              全部 props 来自 hook 返回值，自身无内部状态。
 *              Notice card grid + Pagination + empty state; all props come
 *              from hooks, stateless.
 */
import { memo } from "react";
import { useLocale } from "@/core/i18n";
import { Pagination } from "@/shared/ui";
import type { NoticeItem } from "../types";
import { NoticeCard } from "./NoticeCard";

export interface NoticeListProps {
  items: NoticeItem[];
  loading: boolean;
  page: number;
  totalPages: number;
  serverPageSize: number;
  total: number;
  setPage: (page: number) => void;
  openNotice: (notice: NoticeItem) => void;
  feedbackEnabled: boolean;
  observeCard: (el: HTMLElement | null, noticeId: number) => void;
}

// P0 性能优化：React.memo 避免翻页/筛选时列表组件不必要重渲染
// 回滚：删除 memo() 包裹，恢复为 export function NoticeList(...)
export const NoticeList = memo(function NoticeList({
  items,
  loading,
  page,
  totalPages,
  serverPageSize,
  total,
  setPage,
  openNotice,
  feedbackEnabled,
  observeCard,
}: NoticeListProps) {
  const { t } = useLocale();

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map((item) => (
          <NoticeCard
            key={item.id}
            item={item}
            onClick={openNotice}
            // [dismiss/収藏功能临时禁用 2026-07-30] ���馈按钮 props 已移除
            observe={feedbackEnabled ? observeCard : undefined}
          />
        ))}
      </div>

      {!loading && items.length === 0 && (
        <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
          {t("procurement_noMatch")}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        serverPageSize={serverPageSize}
        total={total}
        loading={loading}
        onPageChange={setPage}
      />
    </>
  );
});
