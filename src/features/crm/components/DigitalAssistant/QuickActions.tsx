/**
 * 快捷操作面板
 * Quick Actions Panel
 *
 * @module features/crm/components/DigitalAssistant/QuickActions
 * @description 输入框上方的上下文感知快捷按钮
 *              Context-aware quick action buttons above the input field
 */

import { Sparkles, Users, Activity, TrendingUp, UserPlus } from "lucide-react";
import type { QuickActionType } from "../../hooks/useDigitalAssistant";

type QuickAction = {
  key: QuickActionType;
  labelKey: string;
  icon: typeof Sparkles;
};

const ACTIONS: QuickAction[] = [
  { key: "match", labelKey: "crmQaMatch", icon: Sparkles },
  { key: "query_leads", labelKey: "crmQaQueryLeads", icon: Users },
  { key: "lead_status", labelKey: "crmQaLeadStatus", icon: Activity },
  { key: "opp_help", labelKey: "crmQaOppHelp", icon: TrendingUp },
  { key: "request_human", labelKey: "crmQaRequestHuman", icon: UserPlus },
];

type QuickActionsProps = {
  /** t() 翻译函数 */
  t: (key: string) => string;
  /** 操作回调 */
  onAction: (action: QuickActionType) => void;
  /** 是否禁用（如正在思考时） */
  disabled?: boolean;
};

export function QuickActions({ t, onAction, disabled }: QuickActionsProps) {
  return (
    <div className="flex gap-2 px-4 py-2 border-t border-slate-100 overflow-x-auto scrollbar-thin">
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        const isHuman = action.key === "request_human";
        return (
          <button
            key={action.key}
            type="button"
            disabled={disabled}
            onClick={() => onAction(action.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs
              border whitespace-nowrap transition-colors shrink-0
              disabled:opacity-50 disabled:cursor-not-allowed
              ${isHuman
                ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300"
                : "border-slate-200 text-slate-600 hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700"
              }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {t(action.labelKey)}
          </button>
        );
      })}
    </div>
  );
}

QuickActions.displayName = "QuickActions";
