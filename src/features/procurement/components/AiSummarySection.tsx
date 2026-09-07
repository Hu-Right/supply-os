/**
 * AI 拆标摘要区
 * AI Bid Summary Section
 *
 * @module features/procurement/components/AiSummarySection
 * @description 展示 AI 生成的招标摘要：核心交付物、关键资质要求、付款与周期、风险提示。
 *              免费用户可看到摘要概要，完整分析需升级会员。
 *              数据通过 props 注入（后端 API 待接入），无数据时展示占位引导。
 */
import { useState } from "react";
import {
  Package,
  ShieldCheck,
  Banknote,
  AlertTriangle,
  Lock,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";

/** AI 拆标摘要数据结构 */
export interface AiSummaryData {
  /** 核心交付物 */
  coreDeliverables?: string;
  /** 关键资质要求 */
  keyQualifications?: string;
  /** 付款与周期 */
  paymentAndCycle?: string;
  /** 风险提示 */
  riskAlerts?: string;
}

export interface AiSummarySectionProps {
  /** AI 摘要数据（后端 API 待接入） */
  data?: AiSummaryData | null;
  /** 是否正在加载 AI 摘要 */
  loading?: boolean;
  /** 是否已解锁完整 AI 分析（免费用户=false） */
  isUnlocked?: boolean;
  /** 点击"查看完整分析"的回调 */
  onUnlock?: () => void;
}

interface SummaryItem {
  icon: typeof Package;
  iconColor: string;
  titleKey: string;
  titleDefault: string;
  content?: string;
}

/** AI 拆标摘要区 */
export function AiSummarySection({
  data,
  loading = false,
  isUnlocked = false,
  onUnlock,
}: AiSummarySectionProps) {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);

  const items: SummaryItem[] = [
    {
      icon: Package,
      iconColor: "text-teal-600",
      titleKey: "procurement_aiSummaryDeliverables",
      titleDefault: "核心交付",
      content: data?.coreDeliverables,
    },
    {
      icon: ShieldCheck,
      iconColor: "text-blue-600",
      titleKey: "procurement_aiSummaryQualifications",
      titleDefault: "关键资质",
      content: data?.keyQualifications,
    },
    {
      icon: Banknote,
      iconColor: "text-amber-600",
      titleKey: "procurement_aiSummaryPayment",
      titleDefault: "付款与周期",
      content: data?.paymentAndCycle,
    },
    {
      icon: AlertTriangle,
      iconColor: "text-rose-600",
      titleKey: "procurement_aiSummaryRisks",
      titleDefault: "风险提示",
      content: data?.riskAlerts,
    },
  ];

  const hasData = items.some((item) => item.content);

  // 加载中骨架屏
  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-teal-600" />
          <h3 className="text-base font-extrabold text-slate-900">
            {t("procurement_aiSummaryTitle") || "AI 拆标摘要"}
          </h3>
          <span className="text-2xs text-slate-400 font-normal">
            {t("procurement_aiSummaryBy") || "由 OS AI 分析生成"}
          </span>
        </div>
        <div className="space-y-3 animate-pulse">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="h-4 w-24 bg-slate-200 rounded mb-2" />
              <div className="h-3 w-full bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  // 无数据时展示占位引导
  if (!hasData) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-teal-600" />
          <h3 className="text-base font-extrabold text-slate-900">
            {t("procurement_aiSummaryTitle") || "AI 拆标摘要"}
          </h3>
        </div>
        <p className="text-sm text-slate-500">
          {t("procurement_aiSummaryUnavailable") || "AI 分析正在生成中，请稍后刷新查看。"}
        </p>
      </section>
    );
  }

  // 免费用户：仅展示前 2 项概要 + 锁定后 2 项
  const visibleItems = isUnlocked ? items : items.slice(0, 2);
  const lockedItems = isUnlocked ? [] : items.slice(2);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-teal-600" />
          <h3 className="text-base font-extrabold text-slate-900">
            {t("procurement_aiSummaryTitle") || "AI 拆标摘要"}
          </h3>
          <span className="text-2xs text-slate-400 font-normal">
            {t("procurement_aiSummaryBy") || "由 OS AI 分析生成"}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {visibleItems.map((item) => (
          <div
            key={item.titleDefault}
            className="rounded-xl border border-slate-100 bg-slate-50/70 p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <item.icon className={`w-4 h-4 ${item.iconColor}`} />
              <h4 className="text-sm font-extrabold text-slate-900">
                {t(item.titleKey) || item.titleDefault}
              </h4>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{item.content}</p>
          </div>
        ))}
      </div>

      {/* 锁定项：免费用户看到后 2 项的锁定占位 */}
      {!isUnlocked && lockedItems.length > 0 && (
        <div className="mt-3 space-y-3">
          {lockedItems.map((item) => (
            <div
              key={item.titleDefault}
              className="rounded-xl border border-amber-100 bg-amber-50/50 p-4 relative overflow-hidden"
            >
              <div className="flex items-center gap-2 mb-2">
                <item.icon className={`w-4 h-4 ${item.iconColor} opacity-40`} />
                <h4 className="text-sm font-extrabold text-slate-400">
                  {t(item.titleKey) || item.titleDefault}
                </h4>
              </div>
              {/* 模糊遮罩 */}
              <div className="blur-sm select-none pointer-events-none">
                <p className="text-sm text-slate-300 leading-relaxed">
                  {item.content || "••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••"}
                </p>
              </div>
              {/* 锁定提示覆盖层 */}
              <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
                  <Lock className="w-3.5 h-3.5" />
                  {t("procurement_aiSummaryLocked") || "升级会员解锁完整 AI 分析"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 展开/收起按钮（免费用户） */}
      {!isUnlocked && (
        <Button
          onClick={() => setExpanded((v) => !v)}
          variant="ghost"
          size="sm"
          className="mt-4 w-full gap-2 text-sm font-bold text-teal-700 hover:bg-teal-50"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              {t("procurement_collapse") || "收起"}
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              {t("procurement_viewFullAiAnalysis") || "查看完整 AI 分析报告 →"}
            </>
          )}
        </Button>
      )}
    </section>
  );
}
