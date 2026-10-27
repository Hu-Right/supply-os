"use client";

/**
 * 我的采购记录面板 — 展示件（自 MyRecordsPanel.tsx 拆出，JSX 逐字不变）。
 * 全部 React.memo：概览卡、记录行卡、分页条；数据与分页状态由容器（useOrderHistory）驱动。
 *
 * @module features/payment/components/records-panel/parts
 */
import { memo } from "react";
import { CheckCircle2 } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import { ORDER_STATUS } from "@/shared/constants/order-status";
import { recordTime, recordTitle, recordSubtitle, type RecordRow } from "./record-format";

/** 概览态：订单蓝卡 + 解锁 teal 卡 */
export const OverviewCards = memo(function OverviewCards({
  ordersTotal,
  unlocksTotal,
  onOpen,
}: {
  ordersTotal: number;
  unlocksTotal: number;
  onOpen: (tab: "orders" | "unlocks") => void;
}) {
  const { t } = useLocale();
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Button
        type="button"
        variant="outline"
        onClick={() => onOpen("orders")}
        className="text-start justify-start rounded-xl bg-white p-4 hover:border-blue-200 hover:bg-blue-50/40"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-extrabold text-slate-900">{t("myRecordsOrdersTitle")}</p>
          <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">
            {ordersTotal}
          </span>
        </div>
        <p className="text-3xs text-slate-500 mt-1">{t("myRecordsOrdersDesc")}</p>
        <p className="text-3xs text-blue-600 mt-2 font-bold">{t("myRecordsOrdersHint")} →</p>
      </Button>

      <Button
        type="button"
        variant="outline"
        onClick={() => onOpen("unlocks")}
        className="text-start justify-start rounded-xl border-teal-100 bg-teal-50 p-4 hover:border-teal-300 hover:bg-teal-50"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-extrabold text-teal-950">{t("myRecordsUnlocksTitle")}</p>
          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-black text-teal-700">
            {unlocksTotal}
          </span>
        </div>
        <p className="text-3xs text-teal-700 mt-1">{t("myRecordsUnlocksDesc")}</p>
        <p className="text-3xs text-teal-800 mt-2 font-bold">{t("myRecordsUnlocksHint")} →</p>
      </Button>
    </div>
  );
});

/** 单条记录行卡（订单/解锁两态共用；解锁行附截止日期与过期标记） */
export const RecordRowCard = memo(function RecordRowCard({
  row,
  isUnlocksView,
  onOpenNotice,
}: {
  row: RecordRow;
  isUnlocksView: boolean;
  onOpenNotice: (noticeId: number) => void;
}) {
  const { t } = useLocale();
  const isOrder = "orderNo" in row;
  // 公告主键：订单行按已迁移的 noticeId，解锁行仍按 unlocks 端点自己的列名
  const noticeId = isOrder ? row.noticeId : row.notice_id;
  const canOpen = Boolean(
    noticeId && (isUnlocksView || (isOrder && row.status === ORDER_STATUS.PAID)),
  );
  return (
    <article
      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-start">
        <div className="min-w-0 pe-2">
          <p className="font-black text-slate-800 truncate">{recordTitle(row, t)}</p>
          <p className="mt-1 text-slate-500 truncate">
            {recordSubtitle(row, t)}
          </p>
        </div>
        {isOrder ? (
          <span
            className={`shrink-0 font-black ${row.status === ORDER_STATUS.PAID ? "text-teal-700" : row.status === ORDER_STATUS.CLOSED ? "text-slate-400" : "text-amber-700"}`}
          >
            {row.status === ORDER_STATUS.PAID ? t("myPurchasesStatus_paid") : row.status || "-"}
          </span>
        ) : (
          <CheckCircle2 className="w-4 h-4 shrink-0 text-teal-600" />
        )}
      </div>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-slate-500">
        <span className="truncate">
          {isOrder
            ? `${row.currency || "CNY"} ${Number(row.amount || 0).toFixed(2)} · ${recordTime(row)}`
            : row.notice?.country || row.notice?.reference || "-"}
        </span>
        {canOpen && (
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => onOpenNotice(Number(noticeId))}
            className="shrink-0 px-0 font-black"
          >
            {t("myPurchasesOpenDetail")}
          </Button>
        )}
      </div>
      {/* 公采搜索功能（本地差异 #6 配套：需求 2 客诉止血）——
          解锁行补公告截止日期，已过期（服务端按 deadline_ts 判定）加醒目标记 */}
      {!isOrder && row.notice?.deadline && (
        <div className="mt-1.5 flex items-center gap-2 text-slate-500">
          <span className="truncate">
            {t("myRecordsDeadline")}: {row.notice.deadline}
          </span>
          {row.notice.deadline_expired === true && (
            <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 font-black text-rose-700">
              {t("myRecordsExpired")}
            </span>
          )}
        </div>
      )}
    </article>
  );
});

/** 分页条 */
export const PagerBar = memo(function PagerBar({
  total,
  page,
  totalPages,
  loading,
  onPage,
}: {
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  onPage: (p: number) => void;
}) {
  const { t } = useLocale();
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
      <span>
        {t("myRecordsPagerInfo", { total, page, pages: totalPages })}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1 || loading}
          onClick={() => onPage(Math.max(1, page - 1))}
          className="font-black disabled:opacity-40"
        >
          {t("myPurchasesPrev")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= totalPages || loading}
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          className="font-black disabled:opacity-40"
        >
          {t("myPurchasesNext")}
        </Button>
      </div>
    </div>
  );
});
