/**
 * 我的收藏面板 — 容器（设置页「我的收藏」）
 * My Favorites Panel
 *
 * @module features/payment/components/MyRecordsPanel
 * @description 2026-11-25 收敛：设置页不再承载订单/账单/发票（统一去费用中心），
 *              「我的记录」改为「我的收藏」，只展示用户收藏的公告（按收藏时间倒序，
 *              已下架公告不返回）。
 *
 *              历史：曾为「支付订单 + 我的收藏」双卡面板；订单卡已移除，
 *              订单、发票、续费入口统一由费用中心（/billing）承接。
 */

import { useEffect } from "react";
import { useLocale } from "@/core/i18n";
import { useUserId } from "@/core/auth";
import { Button } from "@/shared/ui";
import { useOrderHistory } from "../hooks/useOrderHistory";
import { FavoriteRowCard, PagerBar } from "./records-panel/parts";
import type { FavoriteRecord } from "../api";

type MyFavoritesPanelProps = {
  /** 打开关联公告（由外层负责关闭弹窗并跳转） */
  onOpenNotice: (noticeId: number) => void;
};

export function MyRecordsPanel({ onOpenNotice }: MyFavoritesPanelProps) {
  const { t, locale } = useLocale();
  const userId = useUserId();
  const history = useOrderHistory(userId);
  const { tab, setTab } = history;

  // 该面板只有收藏：首次挂载/切换用户后切到 favorites tab（订单已收敛到费用中心）
  useEffect(() => {
    if (userId && tab !== "favorites") setTab("favorites");
  }, [userId, tab, setTab]);

  if (!userId) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        {t("myPurchasesLoginRequired")}
      </div>
    );
  }

  const favoriteRows: FavoriteRecord[] = history.favorites?.list || [];
  const isEmpty = favoriteRows.length === 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="space-y-2">
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
                : t("myPurchasesEmptyViews")}
          </div>
        )}
        {favoriteRows.map((item) => (
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


