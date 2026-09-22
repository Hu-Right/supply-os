/**
 * CRM 底部功能卡片
 * CRM Feature Cards
 *
 * @module features/crm/components/CrmFeatureCards
 * @description 工作台底部 4 个功能入口卡片（截止日历/团队任务/文件中心/顾问协同）
 */
import { CalendarDays, CheckSquare, FileText, Headphones } from "lucide-react";

const FEATURE_CARDS = [
  { icon: CalendarDays, title: "截止日历", lines: ["7天内 7 个截止", "本月 23 个截止"] },
  { icon: CheckSquare, title: "团队任务", lines: ["待办 5 个任务", "已完成 12 个"] },
  { icon: FileText, title: "文件中心", lines: ["投标文件 128 份", "共享文件 32 份"] },
  { icon: Headphones, title: "顾问协同", lines: ["在线顾问 3 位", "咨询记录 18 条"] },
];

export function CrmFeatureCards() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <h3 className="text-base font-extrabold text-slate-900 mb-1">截止日历 / 团队任务 / 文件中心 / 顾问协同</h3>
      <p className="text-xs text-slate-500 mb-4">CRM属于登录后的工作台，不再作为官网一级导航展示内部"0条线索"。</p>
      <div className="grid grid-cols-4 gap-4">
        {FEATURE_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="text-center p-4 rounded-xl border border-slate-100 hover:border-teal-200 transition-colors">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-teal-50 mb-3">
                <Icon className="w-6 h-6 text-teal-600" />
              </div>
              <p className="text-sm font-extrabold text-slate-900 mb-1">{card.title}</p>
              {card.lines.map((line) => (
                <p key={line} className="text-xs text-slate-500">{line}</p>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

CrmFeatureCards.displayName = "CrmFeatureCards";
