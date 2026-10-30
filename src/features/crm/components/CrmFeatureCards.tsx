/**
 * CRM 底部功能卡片
 * CRM Feature Cards
 *
 * @module features/crm/components/CrmFeatureCards
 * @description 工作台底部 4 个功能入口卡片（截止日历/团队任务/文件中心/顾问协同）
 */
import { CalendarDays, CheckSquare, FileText, Headphones } from "lucide-react";
import { useLocale } from "@/core/i18n";

const FEATURE_CARDS = [
  { icon: CalendarDays, titleKey: "crmFeatureCalendarTitle", lineKeys: ["crmFeatureCalendarLine1", "crmFeatureCalendarLine2"] },
  { icon: CheckSquare, titleKey: "crmFeatureTasksTitle", lineKeys: ["crmFeatureTasksLine1", "crmFeatureTasksLine2"] },
  { icon: FileText, titleKey: "crmFeatureFilesTitle", lineKeys: ["crmFeatureFilesLine1", "crmFeatureFilesLine2"] },
  { icon: Headphones, titleKey: "crmFeatureConsultTitle", lineKeys: ["crmFeatureConsultLine1", "crmFeatureConsultLine2"] },
];

export function CrmFeatureCards() {
  const { t } = useLocale();
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <h3 className="text-base font-extrabold text-slate-900 mb-1">{t("crmFeatureSectionTitle")}</h3>
      <p className="text-xs text-slate-500 mb-4">{t("crmFeatureSectionDesc")}</p>
      <div className="grid grid-cols-4 gap-4">
        {FEATURE_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.titleKey} className="text-center p-4 rounded-xl border border-slate-100 hover:border-teal-200 transition-colors">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-teal-50 mb-3">
                <Icon className="w-6 h-6 text-teal-600" />
              </div>
              <p className="text-sm font-extrabold text-slate-900 mb-1">{t(card.titleKey)}</p>
              {card.lineKeys.map((lineKey) => (
                <p key={lineKey} className="text-xs text-slate-500">{t(lineKey)}</p>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

CrmFeatureCards.displayName = "CrmFeatureCards";
