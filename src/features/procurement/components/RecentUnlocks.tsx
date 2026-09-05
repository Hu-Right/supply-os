/**
 * 采购页"最近解锁"快捷区
 * Recent unlocks quick strip on the procurement page
 *
 * @module features/procurement/components/RecentUnlocks
 * @description ARCH-P2-解耦（2026-09-05）：从 features/payment/components/ 迁移至
 *              features/procurement/components/，消除 procurement→payment 跨 feature 硬依赖。
 *              API 调用改为 core/http 直连（原 features/payment/api 的 fetchUnlocks 仅
 *              是 apiCached 薄包装，内联后行为完全一致）。
 *
 *              拉取当前用户最近 3 条公告解锁记录，提供站内"打开"跳转；
 *              非英文界面语言下标题按译文渲染，支持查看原文切换并附 AI 译文来源提示。
 *              无记录或加载失败时静默不渲染，不阻断采购列表。
 */

import { useEffect, useState } from "react";
import { ArrowRight, History } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { apiCached, buildQuery } from "@/core/http";
import { Button } from "@/shared/ui";

/** 解锁记录（与 payment/api UnlockRecord 对齐） */
interface UnlockRecord {
  user_id: number;
  notice_id: number;
  unlock_type: string;
  price: number;
  unlocked_at?: string | null;
  notice?: {
    title?: string | null;
    title_i18n?: string | null;
    deadline_expired?: boolean | null;
  } | null;
}

/** 本地差异 #18：与 features/payment/api 对齐 */
const NOTICE_API_LANGS = new Set(["zh", "en", "fr", "ru", "es", "ar"]);

/** 查询用户解锁记录（从 features/payment/api 内联，行为一致） */
async function fetchUnlocks(params: {
  page?: number;
  limit?: number;
  locale?: string;
}): Promise<{ total: number; list: UnlockRecord[] }> {
  const qs = buildQuery({
    page: params.page,
    limit: params.limit,
    lang: params.locale && NOTICE_API_LANGS.has(params.locale) ? params.locale : undefined,
  });
  return apiCached<{ total: number; list: UnlockRecord[] }>(`/api/payment/unlocks?${qs}`, 5 * 60 * 1000);
}

export interface RecentUnlocksProps {
  userId: number;
  onOpenNotice: (noticeId: number) => void;
}

export function RecentUnlocks({ userId, onOpenNotice }: RecentUnlocksProps) {
  const { t, locale } = useLocale();
  const [records, setRecords] = useState<UnlockRecord[]>([]);
  const [showOriginal, setShowOriginal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setShowOriginal(false);
    fetchUnlocks({ limit: 3, locale })
      .then((res) => {
        if (!cancelled) setRecords(res.list || []);
      })
      .catch(() => {
        if (!cancelled) setRecords([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, locale]);

  if (records.length === 0) return null;

  const hasTranslation = records.some((record) => !!record.notice?.title_i18n);

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs font-black text-slate-500 uppercase flex items-center gap-1.5">
          <History className="w-4 h-4 text-teal-600" />
          {t("procurement_poolTitle")}
        </p>
        {hasTranslation && (
          <Button
            onClick={() => setShowOriginal((v) => !v)}
            variant="link"
            size="sm"
            className="shrink-0 px-0"
          >
            {showOriginal ? t("procurement_viewTranslation") : t("procurement_viewOriginal")}
          </Button>
        )}
      </div>
      <ul className="space-y-2">
        {records.map((record) => {
          const translatedTitle = record.notice?.title_i18n;
          const title =
            (!showOriginal && translatedTitle) ||
            record.notice?.title ||
            `#${record.notice_id}`;
          return (
            <li
              key={`${record.notice_id}-${record.unlocked_at || ""}`}
              className="flex items-center justify-between gap-3 rounded-lg bg-white border border-slate-100 px-3 py-2"
            >
              <span dir="auto" className="text-sm font-bold text-slate-700 truncate min-w-0 flex-1">
                {title}
              </span>
              <span className="shrink-0 flex items-center gap-1.5">
                {record.notice?.deadline_expired === true && (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-3xs font-black text-rose-700">
                    {t("myRecordsExpired")}
                  </span>
                )}
                <Button
                  onClick={() => onOpenNotice(record.notice_id)}
                  variant="link"
                  size="sm"
                  className="gap-1 px-0 font-black hover:text-teal-800 cursor-pointer"
                >
                  {t("myPurchasesOpenDetail")}
                  <ArrowRight className="w-3.5 h-3.5 rtl:-scale-x-100" />
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
      {hasTranslation && !showOriginal && (
        <p className="text-3xs text-slate-400 mt-2">{t("procurement_translateNote")}</p>
      )}
    </div>
  );
}

RecentUnlocks.displayName = "RecentUnlocks";
