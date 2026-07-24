/**
 * 我的采购记录页面
 * My Purchases page
 *
 * @module features/payment/pages/MyPurchasesPage
 * @description 展示当前用户的支付订单与公告解锁记录，支持 tab 切换与分页
 *              Shows the current user's payment orders and notice unlock
 *              history with tab switching and pagination.
 */

import { ChevronLeft, ChevronRight, ListChecks, Lock, ShoppingBag } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import { Button, EmptyState, Spinner } from "@/shared/ui";
import { useOrderHistory, type PurchaseTab } from "../hooks/useOrderHistory";
import { OrderHistoryList } from "../components/OrderHistoryList";
import { UnlockHistoryList } from "../components/UnlockHistoryList";

export default function MyPurchasesPage() {
  const { t } = useLocale();
  const { authUser } = useAuth();
  const navigate = useNavigate();
  const userKey = authUser?.user_key;
  const history = useOrderHistory(userKey);

  const openNotice = (noticeId: number) => navigate(`/procurement?notice_id=${noticeId}`);

  const tabs: Array<{ key: PurchaseTab; label: string }> = [
    { key: "orders", label: t("myPurchasesTabOrders") },
    { key: "unlocks", label: t("myPurchasesTabUnlocks") },
  ];

  if (!userKey) {
    return (
      <div className="mx-auto max-w-3xl py-12">
        <EmptyState
          icon={<Lock className="h-12 w-12" />}
          title={t("myPurchasesTitle")}
          description={t("myPurchasesLoginRequired")}
        />
      </div>
    );
  }

  const orders = history.orders?.list || [];
  const unlocks = history.unlocks?.list || [];
  const isEmpty =
    !history.loading &&
    !history.error &&
    (history.tab === "orders" ? orders.length === 0 : unlocks.length === 0);

  return (
    <div className="space-y-5">
      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center gap-3">
          <ShoppingBag className="w-6 h-6 text-teal-600" />
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">{t("myPurchasesTitle")}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{t("myPurchasesSubtitle")}</p>
          </div>
        </div>

        <div className="mt-5 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          {tabs.map((tab) => {
            const active = history.tab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => history.setTab(tab.key)}
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-bold transition-colors cursor-pointer ${
                  active ? "bg-white text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab.key === "orders" ? (
                  <ListChecks className="w-4 h-4" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        {history.loading && (
          <div className="py-16">
            <Spinner size="lg" className="mx-auto" />
          </div>
        )}

        {!history.loading && history.error && (
          <div className="py-10">
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
              history.tab === "orders"
                ? t("myPurchasesEmptyOrders")
                : t("myPurchasesEmptyUnlocks")
            }
          />
        )}

        {!history.loading && !history.error && !isEmpty && (
          <>
            {history.tab === "orders" ? (
              <OrderHistoryList orders={orders} onOpenNotice={openNotice} />
            ) : (
              <UnlockHistoryList unlocks={unlocks} onOpenNotice={openNotice} />
            )}

            {history.totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={history.page <= 1}
                  onClick={() => history.setPage(history.page - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
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
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

MyPurchasesPage.displayName = "MyPurchasesPage";
