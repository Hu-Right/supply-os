/**
 * 采购页"最近解锁"快捷区
 * Recent unlocks quick strip on the procurement page
 *
 * @module features/payment/components/RecentUnlocks
 * @description 拉取当前用户最近 3 条公告解锁记录，提供站内"打开"跳转；
 *              无记录或加载失败时静默不渲染，不阻断采购列表。
 *              Fetches the user's latest 3 notice unlocks with an in-app
 *              "open" action. Renders nothing on empty/error to avoid
 *              blocking the procurement list.
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
  const { t } = useLocale();
  const [records, setRecords] = useState<UnlockRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchUnlocks({ userKey, limit: 3 })
      .then((res) => {
        if (!cancelled) setRecords(res.list || []);
      })
      .catch(() => {
        if (!cancelled) setRecords([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userKey]);

  if (records.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-black text-slate-500 uppercase flex items-center gap-1.5 mb-3">
        <History className="w-4 h-4 text-teal-600" />
        {t("procurement_recentUnlocksTitle")}
      </p>
      <ul className="space-y-2">
        {records.map((record) => (
          <li
            key={`${record.notice_id}-${record.unlocked_at || ""}`}
            className="flex items-center justify-between gap-3 rounded-lg bg-white border border-slate-100 px-3 py-2"
          >
            <span className="text-sm font-bold text-slate-700 truncate min-w-0">
              {record.notice?.title || `#${record.notice_id}`}
            </span>
            <button
              onClick={() => onOpenNotice(record.notice_id)}
              className="inline-flex items-center gap-1 text-xs font-black text-teal-700 hover:text-teal-800 shrink-0 cursor-pointer"
            >
              {t("myPurchasesOpenDetail")}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

RecentUnlocks.displayName = "RecentUnlocks";
