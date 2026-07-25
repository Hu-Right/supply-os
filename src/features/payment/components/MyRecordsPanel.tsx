/**
 * 我的采购记录面板
 * My Records Panel
 *
 * @module features/payment/components/MyRecordsPanel
 * @description 账户弹窗内嵌的采购记录面板，本地 view 状态在概览与
 *              订单 / 解锁两个下钻视图之间切换，复用 useOrderHistory 与列表组件。
 *              Self-contained purchase records panel embedded in the account
 *              modal. A local `view` state switches between the overview and the
 *              orders / unlocks drill-down views, reusing useOrderHistory and the
 *              list components.
 */

import { useState } from "react";
import { ChevronLeft, ChevronRight, ListChecks, Lock, RefreshCw, ShoppingBag } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import { Button, EmptyState, Spinner } from "@/shared/ui";
import { useOrderHistory, type PurchaseTab } from "../hooks/useOrderHistory";
import { useRecordsSummary } from "../hooks/useRecordsSummary";
import { OrderHistoryList } from "./OrderHistoryList";
import { UnlockHistoryList } from "./UnlockHistoryList";

type MyRecordsPanelProps = {
  /** 打开关联公告（由外层负责关闭弹窗并跳转） */
  onOpenNotice: (noticeId: number) => void;
};

type PanelView = "overview" | PurchaseTab;

export function MyRecordsPanel({ onOpenNotice }: MyRecordsPanelProps) {
  const { t } = useLocale();
  const { authUser } = useAuth();
  const userKey = authUser?.user_key;
  const [view, setView] = useState<PanelView>("overview");
  const history = useOrderHistory(userKey);
  const summary = useRecordsSummary(userKey);

  if (!userKey) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        {t("myPurchasesLoginRequired")}
      </div>
    );
  }

  const openView = (next: PurchaseTab) => {
    history.setTab(next);
    setView(next);
  };

  if (view === "overview") {
    const cards: Array<{
      key: PurchaseTab;
      icon: typeof ListChecks;
      title: string;
      desc: string;
      total: number;
      preview: string;
    }> = [
      {
        key: "orders",
        icon: ListChecks,
        title: t("myPurchasesTabOrders"),
        desc: t("myRecordsOrdersDesc"),
        total: summary.ordersTotal,
        preview: summary.ordersFirst
          ? summary.ordersFirst.notice?.title || summary.ordersFirst.order_no
          : "",
      },
      {
        key: "unlocks",
        icon: Lock,
        title: t("myPurchasesTabUnlocks"),
        desc: t("myRecordsUnlocksDesc"),
        total: summary.unlocksTotal,
        preview: summary.unlocksFirst
          ? summary.unlocksFirst.notice?.title || `#${summary.unlocksFirst.notice_id}`
          : "",
      },
    ];

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
          <ShoppingBag className="h-4 w-4 text-teal-600" />
          {t("myPurchasesTitle")}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cards.map(({ key, icon: Icon, title, desc, total, preview }) => (
            <button
              key={key}
              onClick={() => openView(key)}
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-teal-300 hover:bg-teal-50/40"
            >
              <span className="rounded-lg bg-teal-50 p-2 text-teal-600">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="block text-sm font-bold text-slate-900">{title}</span>
                  {total > 0 && (
                    <span className="shrink-0 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-black text-teal-700">
                      {total}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">{desc}</span>
                {preview && (
                  <span className="mt-1 block truncate text-[11px] text-slate-400">
                    {t("myRecordsLatest")}: {preview}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const orders = history.orders?.list || [];
  const unlocks = history.unlocks?.list || [];
  const isEmpty =
    !history.loading &&
    !history.error &&
    (view === "orders" ? orders.length === 0 : unlocks.length === 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setView("overview")}
          className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800"
        >
          <ChevronLeft className="h-4 w-4" />
          {t("myRecordsBackToOverview")}
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm font-extrabold text-slate-900">
            {view === "orders" ? t("myPurchasesTabOrders") : t("myPurchasesTabUnlocks")}
          </span>
          <button
            onClick={history.refresh}
            aria-label={t("myRecordsRefresh")}
            className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-teal-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("myRecordsRefresh")}
          </button>
        </div>
      </div>

      {history.loading && (
        <div className="py-10">
          <Spinner size="lg" className="mx-auto" />
        </div>
      )}

      {!history.loading && history.error && (
        <div className="py-8">
          <EmptyState
            title={t("myPurchasesLoadFailed")}
            action={
              <Button variant="secondary" size="sm" onClick={history.refresh}>
                {t("myPurchasesRetry")}
              </Button>
            }
          />
        </div>
      )}

      {isEmpty && (
        <EmptyState
          title={
            view === "orders" ? t("myPurchasesEmptyOrders") : t("myPurchasesEmptyUnlocks")
          }
        />
      )}

      {!history.loading && !history.error && !isEmpty && (
        <>
          {view === "orders" ? (
            <OrderHistoryList orders={orders} onOpenNotice={onOpenNotice} />
          ) : (
            <UnlockHistoryList unlocks={unlocks} onOpenNotice={onOpenNotice} />
          )}

          {history.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-1">
              <Button
                variant="secondary"
                size="sm"
                disabled={history.page <= 1}
                onClick={() => history.setPage(history.page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
                {t("myPurchasesPrev")}
              </Button>
              <span className="text-xs font-bold text-slate-500">
                {t("myPurchasesPageInfo", { page: history.page, total: history.totalPages })}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={history.page >= history.totalPages}
                onClick={() => history.setPage(history.page + 1)}
              >
                {t("myPurchasesNext")}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

MyRecordsPanel.displayName = "MyRecordsPanel";
