/**
 * 我的采购记录面板
 * My Records Panel
 *
 * @module features/payment/components/MyRecordsPanel
 * @description 账户弹窗内嵌的采购记录面板，UI 对齐原版：概览态为订单蓝卡 +
 *              解锁 teal 卡，下钻态为管理列表（返回/刷新 + article 行 + 分页条）。
 *              Self-contained purchase records panel embedded in the account
 *              modal, aligned with the original UI: overview shows the blue
 *              orders card and teal unlocks card; drill-down shows a management
 *              list (back/refresh header + article rows + pager).
 */

import { useState } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import { Button } from "@/shared/ui";
import type { OrderRecord, UnlockRecord } from "../api";
import { useOrderHistory, type PurchaseTab } from "../hooks/useOrderHistory";
import { useRecordsSummary } from "../hooks/useRecordsSummary";

type MyRecordsPanelProps = {
  /** 打开关联公告（由外层负责关闭弹窗并跳转） */
  onOpenNotice: (noticeId: number) => void;
};

type PanelView = "overview" | PurchaseTab;

type RecordRow = OrderRecord | UnlockRecord;

/** 原版 formatUserDateTime：yyyy-MM-dd HH:mm */
const formatUserDateTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace("T", " ").replace(".000Z", "");
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const recordTime = (row: RecordRow) =>
  formatUserDateTime(
    ("unlocked_at" in row ? row.unlocked_at : undefined) ||
      ("paid_at" in row ? row.paid_at : undefined) ||
      ("created_at" in row ? row.created_at : undefined),
  );

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

  const recordTitle = (row: RecordRow) =>
    row.notice?.title ||
    ("order_no" in row ? row.order_no : "") ||
    (row.notice_id ? String(row.notice_id) : "") ||
    t("myRecordsUntitled");

  const openView = (next: PurchaseTab) => {
    history.setTab(next);
    setView(next);
  };

  if (view === "overview") {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => openView("orders")}
          className="text-start justify-start rounded-xl bg-white p-4 hover:border-blue-200 hover:bg-blue-50/40"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-extrabold text-slate-900">{t("myRecordsOrdersTitle")}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{t("myRecordsOrdersDesc")}</p>
            </div>
            <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">
              {summary.ordersTotal}
            </span>
          </div>
          <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
            <p className="font-black text-slate-800 truncate">
              {summary.ordersFirst ? recordTitle(summary.ordersFirst) : t("myPurchasesEmptyOrders")}
            </p>
            <p className="mt-1 text-slate-500">
              {summary.ordersFirst?.order_no || t("myRecordsOrdersHint")}
            </p>
          </div>
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={() => openView("unlocks")}
          className="text-start justify-start rounded-xl border-teal-100 bg-teal-50 p-4 hover:border-teal-300 hover:bg-teal-50"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-extrabold text-teal-950">{t("myRecordsUnlocksTitle")}</p>
              <p className="text-[11px] text-teal-700 mt-0.5">{t("myRecordsUnlocksDesc")}</p>
            </div>
            <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-black text-teal-700">
              {summary.unlocksTotal}
            </span>
          </div>
          <div className="mt-3 rounded-lg border border-teal-100 bg-white px-3 py-2 text-xs">
            <p className="font-black text-slate-800 truncate">
              {summary.unlocksFirst ? recordTitle(summary.unlocksFirst) : t("myPurchasesEmptyUnlocks")}
            </p>
            <p className="mt-1 text-slate-500">
              {summary.unlocksFirst ? recordTime(summary.unlocksFirst) : t("myRecordsUnlocksHint")}
            </p>
          </div>
        </Button>
      </div>
    );
  }

  const rows: RecordRow[] =
    view === "orders" ? history.orders?.list || [] : history.unlocks?.list || [];

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
            <p className="text-[11px] text-slate-500 mt-0.5">
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
        {rows.map((row) => {
          const isOrder = "order_no" in row;
          const canOpen = Boolean(
            row.notice_id && (view === "unlocks" || (isOrder && row.status === "paid")),
          );
          return (
            <article
              key={isOrder ? row.order_no : `${row.notice_id}-${row.unlocked_at}`}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-start">
                <div className="min-w-0 pe-2">
                  <p className="font-black text-slate-800 truncate">{recordTitle(row)}</p>
                  <p className="mt-1 text-slate-500 truncate">
                    {isOrder ? row.order_no : `${row.unlock_type || "unlock"} · ${recordTime(row)}`}
                  </p>
                </div>
                {isOrder ? (
                  <span
                    className={`shrink-0 font-black ${row.status === "paid" ? "text-teal-700" : row.status === "closed" ? "text-slate-400" : "text-amber-700"}`}
                  >
                    {row.status === "paid" ? t("myPurchasesStatus_paid") : row.status || "-"}
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
                    onClick={() => onOpenNotice(Number(row.notice_id))}
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
        })}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span>
          {t("myRecordsPagerInfo", {
            total: history.total,
            page: history.page,
            pages: history.totalPages,
          })}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={history.page <= 1 || history.loading}
            onClick={() => history.setPage(Math.max(1, history.page - 1))}
            className="font-black disabled:opacity-40"
          >
            {t("myPurchasesPrev")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={history.page >= history.totalPages || history.loading}
            onClick={() => history.setPage(Math.min(history.totalPages, history.page + 1))}
            className="font-black disabled:opacity-40"
          >
            {t("myPurchasesNext")}
          </Button>
        </div>
      </div>
    </section>
  );
}

MyRecordsPanel.displayName = "MyRecordsPanel";
