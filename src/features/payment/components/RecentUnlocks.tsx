/**
 * 采购页"最近解锁"快捷区
 * Recent unlocks quick strip on the procurement page
 *
 * @module features/payment/components/RecentUnlocks
 * @description 拉取当前用户最近 3 条公告解锁记录，提供站内"打开"跳转；
 *              非英文界面语言下标题按译文渲染（与公告详情共用翻译缓存），
 *              支持查看原文切换并附 AI 译文来源提示。
 *              无记录或加载失败时静默不渲染，不阻断采购列表。
 *              Fetches the user's latest 3 notice unlocks with an in-app
 *              "open" action. Titles render in the current locale (shared
 *              translation cache) with an original-text toggle and an
 *              AI-translation note. Renders nothing on empty/error.
 */

import { useEffect, useState } from "react";
import { ArrowRight, History } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { fetchUnlocks, type UnlockRecord } from "../api";

export interface RecentUnlocksProps {
  userKey: string;
  onOpenNotice: (noticeId: number) => void;
}

export function RecentUnlocks({ userKey, onOpenNotice }: RecentUnlocksProps) {
  const { t, locale } = useLocale();
  const [records, setRecords] = useState<UnlockRecord[]>([]);
  const [showOriginal, setShowOriginal] = useState(false);

  // locale 入依赖：切语言重拉带译文的记录；首次缺译时显示原文，
  // 后端已后台补翻，缓存建好后再次进入即为译文
  useEffect(() => {
    let cancelled = false;
    setShowOriginal(false);
    fetchUnlocks({ userKey, limit: 3, locale })
      .then((res) => {
        if (!cancelled) setRecords(res.list || []);
      })
      .catch(() => {
        if (!cancelled) setRecords([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userKey, locale]);

  if (records.length === 0) return null;

  // 任一条有译文才提供"查看原文"切换与 AI 来源提示（en 环境恒为原文，无切换）
  const hasTranslation = records.some((record) => !!record.notice?.title_i18n);

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs font-black text-slate-500 uppercase flex items-center gap-1.5">
          <History className="w-4 h-4 text-teal-600" />
          {t("procurement_recentUnlocksTitle")}
        </p>
        {hasTranslation && (
          <button
            onClick={() => setShowOriginal((v) => !v)}
            className="text-xs font-bold text-blue-700 hover:underline shrink-0"
          >
            {showOriginal ? t("procurement_viewTranslation") : t("procurement_viewOriginal")}
          </button>
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
              <span dir="auto" className="text-sm font-bold text-slate-700 truncate min-w-0">
                {title}
              </span>
              {/* 公采搜索功能（本地差异 #6 配套：需求 2）——已过期解锁醒目标记，防客户误投已截止公告 */}
              {record.notice?.deadline_expired === true && (
                <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-black text-rose-700">
                  {t("myRecordsExpired")}
                </span>
              )}
              <button
                onClick={() => onOpenNotice(record.notice_id)}
                className="inline-flex items-center gap-1 text-xs font-black text-teal-700 hover:text-teal-800 shrink-0 cursor-pointer"
              >
                {t("myPurchasesOpenDetail")}
                <ArrowRight className="w-3.5 h-3.5 rtl:-scale-x-100" />
              </button>
            </li>
          );
        })}
      </ul>
      {hasTranslation && !showOriginal && (
        <p className="text-[11px] text-slate-400 mt-2">{t("procurement_translateNote")}</p>
      )}
    </div>
  );
}

RecentUnlocks.displayName = "RecentUnlocks";
