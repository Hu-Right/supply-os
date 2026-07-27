import { Crown } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { NoticeItem } from "../types";
import { noticeTypeKey } from "../notice-type";

interface NoticeCardProps {
  item: NoticeItem;
  onClick: (item: NoticeItem) => void;
}

export function NoticeCard({ item, onClick }: NoticeCardProps) {
  const { t } = useLocale();
  // 已知采购类型走 i18n 本地化，未识别的长尾值原样回退
  const typeKey = noticeTypeKey(item.notice_type);

  return (
    <article
      className="border border-slate-200 rounded-xl p-4 min-h-64 flex flex-col hover:border-teal-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-black">
          {typeKey ? t(typeKey) : item.notice_type || "Notice"}
        </span>
        <span className="text-[10px] text-slate-500 font-mono text-right">{item.deadline}</span>
      </div>
      <h4 className="text-base font-extrabold text-slate-900 mt-3 line-clamp-2">{item.title}</h4>
      <p className="text-xs text-slate-500 mt-3 line-clamp-3">{item.description || t("procurement_noDesc")}</p>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {(item.core_locked === false ? (item.unspsc_codes || []) : []).slice(0, 4).map((code, index) => (
          <span
            key={`${code.code || index}`}
            className="px-1.5 py-0.5 rounded border border-slate-200 text-[10px] font-mono text-slate-600"
          >
            {code.code || code.name || code.description}
          </span>
        ))}
      </div>
      <div className="mt-auto pt-4 border-t border-slate-100 flex items-end justify-between gap-3">
        <div className="text-xs min-w-0">
          <p className="font-black text-slate-800">{item.estimated_value || t("procurement_budgetPending")}</p>
          <p className="text-slate-500 truncate">
            {item.agency || item.organization || t("procurement_unknownAgency")}
          </p>
        </div>
        <button
          onClick={() => onClick(item)}
          className="px-3 py-2 rounded-lg bg-teal-100 text-teal-800 text-xs font-black hover:bg-teal-200"
        >
          {t("procurement_detail")}
        </button>
      </div>
    </article>
  );
}
