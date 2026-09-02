/**
 * 撮合报告卡片
 * Match Report Card
 *
 * @module features/crm/components/DigitalAssistant/MatchReportCard
 * @description 在对话流中嵌入展示 AI 撮合分析报告，复用 AiMatchmaker 暗色面板风格
 *              Embeds AI matching report in chat flow, reusing AiMatchmaker dark panel style
 */

import { Sparkles } from "lucide-react";

type MatchReportCardProps = {
  /** 报告正文（纯文本 / Markdown） */
  report: string;
  /** 供应商名称 */
  supplierName: string;
  /** 商机名称 */
  opportunityName: string;
  /** t() 翻译函数 */
  t: (key: string) => string;
};

export function MatchReportCard({
  report,
  supplierName,
  opportunityName,
  t,
}: MatchReportCardProps) {
  return (
    <div className="my-3 rounded-xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-950 text-slate-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/60">
        <div className="bg-teal-500 text-slate-900 p-1 rounded-lg">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-teal-400 truncate">
            {t("aiMatchingResult")}
          </p>
          <p className="text-2xs text-slate-500 truncate">
            {supplierName} × {opportunityName}
          </p>
        </div>
        <span className="text-[9px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded font-mono uppercase shrink-0">
          GEMINI REPORT
        </span>
      </div>

      {/* Report Body */}
      <div className="px-4 py-3 max-h-64 overflow-y-auto scrollbar-thin">
        <div className="text-xs leading-relaxed text-slate-300 whitespace-pre-wrap break-words">
          {report}
        </div>
      </div>
    </div>
  );
}

MatchReportCard.displayName = "MatchReportCard";
