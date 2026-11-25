"use client";

/**
 * 我的记录面板 — 展示件（订单 / 收藏两态）。
 *
 * 2026-11-18 产品调整：原「可查看采购（解锁记录）」卡与列表退役，第二张概览卡改为
 * 「我的收藏」，下钻列表展示用户收藏的公告（按收藏时间倒序，已下架公告不出现）。
 * 概览卡、记录行卡、分页条全部 React.memo；数据与分页状态由容器（useOrderHistory）驱动。
 *
 * @module features/payment/components/records-panel/parts
 */
import { memo } from "react";
import { Bookmark } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import { ORDER_STATUS } from "@/shared/constants/order-status";
import { formatNoticeCstDate } from "@/shared/utils/notice-datetime/format";
import { getCountryDisplayName } from "@/shared/data/countryNames";
import type { FavoriteRecord } from "../../api";
import { recordTime, recordTitle, recordSubtitle, type RecordRow } from "./record-format";

/** 概览态：订单入口（跳费用中心）+ 收藏 teal 卡 */
export const OverviewCards = memo(function OverviewCards({
  favoritesTotal,
  onOpen,
}: {
  ordersTotal: number;
  favoritesTotal: number;
  onOpen: (tab: "orders" | "favorites") => void;
}) {
  const { t } = useLocale();
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* 订单已收敛到费用中心（唯一订单/发票/续费入口），这里只保留跳转 */}
      <a
        href="/billing"
        className="flex min-h-[64px] items-center justify-between gap-3 rounded-xl border border-blue-100 bg-white p-4 text-start hover:border-blue-200 hover:bg-blue-50/40"
      >
        <div className="flex min-w-0 items-center gap-2">
          <p className="text-sm font-extrabold text-slate-900 truncate">{t("myRecordsOrdersTitle")}</p>
        </div>
        <span className="shrink-0 text-3xs font-bold text-blue-600">{t("billingCenterTitle")} →</span>
      </a>

      <Button
        type="button"
        variant="outline"
        onClick={() => onOpen("favorites")}
        className="text-start justify-start rounded-xl border-teal-100 bg-teal-50 p-4 hover:border-teal-300 hover:bg-teal-50"
      >
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <p className="text-sm font-extrabold text-teal-950 truncate">{t("myRecordsViewsTitle")}</p>
            <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-black text-teal-700">
              {favoritesTotal}
            </span>
          </div>
          <span className="shrink-0 text-3xs font-bold text-teal-800">{t("myRecordsViewsHint")} →</span>
        </div>
      </Button>
    </div>
  );
});

/** 支付订单记录行卡 */
export const RecordRowCard = memo(function RecordRowCard({
  row,
  onOpenNotice,
}: {
  row: RecordRow;
  onOpenNotice: (noticeId: number) => void;
}) {
  const { t } = useLocale();
  if (!("orderNo" in row)) return null;
  const noticeId = row.noticeId;
  const canOpen = Boolean(noticeId && row.status === ORDER_STATUS.PAID);
  return (
    <article className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-start">
        <div className="min-w-0 pe-2">
          <p className="font-black text-slate-800 truncate">{recordTitle(row, t)}</p>
          <p className="mt-1 text-slate-500 truncate">{recordSubtitle(row, t)}</p>
        </div>
        <span
          className={`shrink-0 font-black ${row.status === ORDER_STATUS.PAID ? "text-teal-700" : row.status === ORDER_STATUS.CLOSED ? "text-slate-400" : "text-amber-700"}`}
        >
          {row.status === ORDER_STATUS.PAID ? t("myPurchasesStatus_paid") : row.status || "-"}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-slate-500">
        <span className="truncate">
          {`${row.currency || "CNY"} ${Number(row.amount || 0).toFixed(2)} · ${recordTime(row)}`}
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
    </article>
  );
});

/** 收藏记录行卡：标题 + 国家/编号 + 截止时间（过期标红），点击打开公告详情 */
export const FavoriteRowCard = memo(function FavoriteRowCard({
  item,
  locale,
  onOpenNotice,
}: {
  item: FavoriteRecord;
  locale: string;
  onOpenNotice: (noticeId: number) => void;
}) {
  const { t } = useLocale();
  const noticePk = Number(item.noticePk || 0);
  const title = item.titleI18n || (locale === "zh" ? item.titleCn : "") || item.title || item.noticeId || "-";
  const country = item.countryCode ? getCountryDisplayName(item.countryCode, locale) : "";
  const meta = [country, item.buyerName || item.buyerNameCn, item.reference].filter(Boolean).join(" · ");
  const deadlineTs = Number(item.deadlineTs || 0);
  const expired = deadlineTs > 0 && deadlineTs * 1000 < Date.now();
  return (
    <article className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-start">
        <div className="min-w-0 pe-2">
          <p className="font-black text-slate-800 line-clamp-2">{title}</p>
          <p className="mt-1 text-slate-500 truncate">{meta || "-"}</p>
        </div>
        <Bookmark className="w-4 h-4 shrink-0 fill-amber-500 text-amber-500" />
      </div>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-slate-500">
        <span className="truncate">
          {deadlineTs > 0 ? `${t("myRecordsDeadline")}: ${formatNoticeCstDate(deadlineTs)}` : "-"}
          {expired && (
            <span className="ms-2 rounded-full bg-rose-50 px-2 py-0.5 font-black text-rose-700">
              {t("myRecordsExpired")}
            </span>
          )}
        </span>
        {noticePk > 0 && (
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => onOpenNotice(noticePk)}
            className="shrink-0 px-0 font-black"
          >
            {t("myPurchasesOpenDetail")}
          </Button>
        )}
      </div>
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
