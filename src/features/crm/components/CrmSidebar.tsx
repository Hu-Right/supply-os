/**
 * CRM 左侧导航栏
 * CRM Sidebar Navigation
 *
 * @module features/crm/components/CrmSidebar
 * @description 工作台左侧导航：菜单项 + AI 额度 + 团队成员 + 升级按钮
 */
import { useState } from "react";
import {
  LayoutDashboard, Briefcase, Sparkles, CalendarDays,
  Users, FolderOpen, Headphones, Settings,
} from "lucide-react";

const NAV_ITEMS = [
  { key: "overview", label: "工作概览", icon: LayoutDashboard },
  { key: "opportunities", label: "我的商机", icon: Briefcase },
  { key: "ai-eval", label: "AI评估", icon: Sparkles },
  { key: "calendar", label: "截止日历", icon: CalendarDays },
  { key: "tasks", label: "团队任务", icon: Users },
  { key: "files", label: "文件中心", icon: FolderOpen },
  { key: "consultant", label: "顾问协同", icon: Headphones },
  { key: "settings", label: "企业设置", icon: Settings },
];

interface CrmSidebarProps {
  activeNav: string;
  onNavChange: (key: string) => void;
}

export function CrmSidebar({ activeNav, onNavChange }: CrmSidebarProps) {
  return (
    <aside className="w-56 shrink-0 bg-slate-900 text-white flex flex-col">
      <div className="p-4">
        <h2 className="text-lg font-extrabold">AI投标工作台</h2>
      </div>
      <nav className="flex-1 px-2 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeNav === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onNavChange(item.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-teal-600 text-white"
                  : "text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="p-4 space-y-4 border-t border-white/10">
        <div>
          <p className="text-xs text-slate-400 mb-1">本月AI额度</p>
          <p className="text-sm font-bold text-white">已用 58 / 100 次</p>
          <div className="mt-1.5 h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full w-[58%] rounded-full bg-teal-500" />
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-400">团队成员 <span className="text-white font-bold">6/20</span></p>
        </div>
        <button className="w-full bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold py-2.5 rounded-lg transition-colors">
          升级企业版<br />解锁更多能力
        </button>
      </div>
    </aside>
  );
}

CrmSidebar.displayName = "CrmSidebar";
