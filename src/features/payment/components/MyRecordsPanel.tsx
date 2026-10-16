/**
 * 我的采购记录面板 — 容器
 * My Records Panel
 *
 * @module features/payment/components/MyRecordsPanel
 * @description 账户弹窗内嵌的采购记录面板，UI 对齐原版：概览态为订单蓝卡 +
 *              解锁 teal 卡，下钻态为管理列表（返回/刷新 + article 行 + 分页条）。
 *              Self-contained purchase records panel embedded in the account
 *              modal, aligned with the original UI: overview shows the blue
 *              orders card and teal unlocks card; drill-down shows a management
 *              list (back/refresh header + article rows + pager).
 *
 *              2026-10 组件化拆分（288→约 120 行）：概览卡/行卡/分页条见 ./records-panel/parts，
 *              行格式化纯函数上收 ./records-panel/record-format；本文件保留视图态与取数编排。
 */

import { useState, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useUserId } from "@/core/auth";
import { Button } from "@/shared/ui";
import type { UnlockRecord } from "../api";
import { useOrderHistory, type PurchaseTab } from "../hooks/useOrderHistory";
import { useRecordsSummary } from "../hooks/useRecordsSummary";
import { OverviewCards, RecordRowCard, PagerBar } from "./records-panel/parts";
import type { RecordRow } from "./records-panel/record-format";

type MyRecordsPanelProps = {
  /** 打开关联公告（由外层负责关闭弹窗并跳转） */
  onOpenNotice: (noticeId: number) => void;
};

type PanelView = "overview" | PurchaseTab;

export function MyRecordsPanel({ onOpenNotice }: MyRecordsPanelProps) {
  const { t } = useLocale();
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
        unlocksTotal={summary.unlocksTotal}
        onOpen={openView}
      />
    );
  }

  const rows: RecordRow[] =
    view === "orders" ? history.orders?.list || [] : history.unlocks?.list || [];
  const rowKey = (row: RecordRow) =>
    "order_no" in row ? row.order_no : `${row.notice_id}-${(row as UnlockRecord).unlocked_at}`;

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
              {view === "orders" ? t("myRecordsOrdersManage") : t("myRecordsUnlocksManage")}
            </p>
            <p className="text-3xs text-slate-500 mt-0.5">
              {view === "orders" ? t("myRecordsOrdersManageDesc") : t("myRecordsUnlocksManageDesc")}
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
        {/* P2-3 修复：加载失败不再静默为空态，展示错误提示 + 重试按钮 */}
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
        {rows.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
            {history.loading
              ? t("myRecordsLoading")
              : history.error
                ? t("myRecordsLoadFailed")
                : view === "orders"
                  ? t("myPurchasesEmptyOrders")
                  : t("myPurchasesEmptyUnlocks")}
          </div>
        )}
        {rows.map((row) => (
          <RecordRowCard
            key={rowKey(row)}
            row={row}
            isUnlocksView={view === "unlocks"}
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
