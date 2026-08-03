/**
 * 拆解文件指示器
 * Breakdown File Indicator
 *
 * @module features/procurement/components/NoticeBreakdownIndicator
 * @description 拆解文件可用性指示：中文版报告 > 原始附件计数 > 无拆解文件；
 *              可用性未知（旧缓存/推荐兑底载荷）回退中性提示。
 *              Breakdown availability badge: report-ready, raw attachment
 *              count, none, or unknown (neutral hint).
 */
import { FileCheck, FileQuestion, FileText, FileX } from "lucide-react";
import { useLocale } from "@/core/i18n";

export interface NoticeBreakdownIndicatorProps {
  /** 中文版订单拆解报告可生成 */
  hasReport: boolean;
  /** 报告可用性已知（未知时回退中性提示） */
  reportKnown: boolean;
  /** 原始附件计数（锁定态为服务端预览计数，缺失时 undefined） */
  breakdownFileCount: number | undefined;
}

export function NoticeBreakdownIndicator({
  hasReport,
  reportKnown,
  breakdownFileCount,
}: NoticeBreakdownIndicatorProps) {
  const { t } = useLocale();

  if (hasReport) {
    return (
      <p className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-teal-200 bg-teal-50 text-xs font-bold text-teal-700">
        <FileCheck className="w-3.5 h-3.5 shrink-0" />
        {t("procurement_hasBreakdownFiles", { count: 1 })}
      </p>
    );
  }

  if (reportKnown) {
    return typeof breakdownFileCount === "number" && breakdownFileCount > 0 ? (
      <p className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
        <FileText className="w-3.5 h-3.5 shrink-0" />
        {t("procurement_hasRawAttachments", { count: breakdownFileCount })}
      </p>
    ) : (
      <p className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
        <FileX className="w-3.5 h-3.5 shrink-0" />
        {t("procurement_noBreakdownFiles")}
      </p>
    );
  }

  return (
    <p className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-200 bg-amber-50 text-xs font-bold text-amber-700">
      <FileQuestion className="w-3.5 h-3.5 shrink-0" />
      {t("procurement_breakdownAfterUnlock")}
    </p>
  );
}
