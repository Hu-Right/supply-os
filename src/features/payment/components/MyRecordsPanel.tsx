/**
 * 我的记录面板 — 容器
 * My Records Panel
 *
 * @module features/payment/components/MyRecordsPanel
 * @description 账户内嵌的「我的记录」面板：概览态为「支付订单」蓝卡 + 「我的收藏」teal 卡，
 *              下钻态为管理列表（返回/刷新 + 行卡 + 分页条）。
 *
 *              2026-11-18 产品调整：原「我的可查看采购（解锁记录）」卡与列表退役，
 *              第二张卡改为「我的收藏」，数据走 /api/notices/favorites
 *              （收藏为私有书签；服务端 INNER JOIN notice_public，已下架公告不返回）。
 */

import { useState, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useUserId } from "@/core/auth";
import { Button } from "@/shared/ui";
import { useOrderHistory, type PurchaseTab } from "../hooks/useOrderHistory";
import { useRecordsSummary } from "../hooks/useRecordsSummary";
import { OverviewCards, RecordRowCard, FavoriteRowCard, PagerBar } from "./records-panel/parts";
import type { RecordRow } from "./records-panel/record-format";
import type { FavoriteRecord } from "../api";

type MyRecordsPanelProps = {
  /** 打开关联公告（由外层负责关闭弹窗并跳转） */
  onOpenNotice: (noticeId: number) => void;
};

type PanelView = "overview" | PurchaseTab;

export function MyRecordsPanel({ onOpenNotice }: MyRecordsPanelProps) {
  const { t, locale } = useLocale();
  const userId = useUserId();
  const [view, setView] = useState<PanelView>("overview");
  const history = useOrderHistory(userId);
  const summary = useRecordsSummary(userId);

  const openView = useCallback((next: PurchaseTab) => {
    history.setTab(next);
    setView(next);
  }, [history]);

  if (!userId) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        {t("myPurchasesLoginRequired")}
      </div>
    );
  }

  if (view === "overview") {
    return (
      <OverviewCards
        ordersTotal={summary.ordersTotal}
        favoritesTotal={summary.favoritesTotal}
        onOpen={openView}
      />
    );
  }

  const orderRows: RecordRow[] = view === "orders" ? history.orders?.list || [] : [];
  const favoriteRows: FavoriteRecord[] = view === "favorites" ? history.favorites?.list || [] : [];
  const isEmpty = view === "orders" ? orderRows.length === 0 : favoriteRows.length === 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="iconSm"
            onClick={() => setView("overview")}
            title={t("myRecordsBackTitle")}
          >
            <ArrowLeft className="w-4 h-4 rtl:-scale-x-100" />
          </Button>
          <div>
            <p className="text-sm font-extrabold text-slate-900">
              {view === "orders" ? t("myRecordsOrdersManage") : t("myRecordsViewsManage")}
            </p>
            <p className="text-3xs text-slate-500 mt-0.5">
              {view === "orders" ? t("myRecordsOrdersManageDesc") : t("myRecordsViewsManageDesc")}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={history.refresh}
          className="font-black text-teal-700 hover:bg-teal-50"
        >
          {history.loading ? t("myRecordsRefreshing") : t("myRecordsRefresh")}
        </Button>
      </div>

      <div className="space-y-2">
        {/* 加载失败不再静默为空态，展示错误提示 + 重试按钮 */}
        {history.error && !history.loading && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-center text-xs text-rose-700">
            <p className="font-black">{t("myRecordsLoadFailed")}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={history.refresh}
              className="mt-2 border-rose-300 bg-white text-rose-700 hover:bg-rose-100"
            >
              {t("myRecordsRetry")}
            </Button>
          </div>
        )}
        {isEmpty && (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
            {history.loading
              ? t("myRecordsLoading")
              : history.error
                ? t("myRecordsLoadFailed")
                : view === "orders"
                  ? t("myPurchasesEmptyOrders")
                  : t("myPurchasesEmptyViews")}
          </div>
        )}
        {view === "orders" &&
          orderRows.map((row) => (
            <RecordRowCard
              key={"orderNo" in row ? row.orderNo : String(row.noticeId)}
              row={row}
              onOpenNotice={onOpenNotice}
            />
          ))}
        {view === "favorites" &&
          favoriteRows.map((item) => (
            <FavoriteRowCard
              key={String(item.noticePk || item.noticeId)}
              item={item}
              locale={locale}
              onOpenNotice={onOpenNotice}
            />
          ))}
      </div>

      <PagerBar
        total={history.total}
        page={history.page}
        totalPages={history.totalPages}
        loading={history.loading}
        onPage={history.setPage}
      />
    </section>
  );
}

MyRecordsPanel.displayName = "MyRecordsPanel";
