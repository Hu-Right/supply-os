/**
 * CRM 统计卡片
 * CRM Stats Cards
 *
 * @module features/crm/components/StatsCards
 */

import { Activity, Clock, TrendingUp, Users } from "lucide-react";
import type { Lead } from "@/types";
import { OPPORTUNITIES } from "@/data";

type StatsCardsProps = {
  leads: Lead[];
  labels: {
    leadCount: string;
    oppCount: string;
    clientPool: string;
    followUpHistory: string;
  };
};

export function StatsCards({ leads, labels }: StatsCardsProps) {
  const metrics = [
    { title: labels.leadCount, val: leads.length, icon: Activity, col: "text-teal-600 bg-teal-50" },
    { title: labels.oppCount, val: OPPORTUNITIES.length, icon: TrendingUp, col: "text-indigo-600 bg-indigo-50" },
    {
      title: labels.clientPool,
      val: leads.filter((l) => l.status === "qualified" || l.status === "contacted").length,
      icon: Users,
      col: "text-emerald-600 bg-emerald-50",
    },
    {
      title: labels.followUpHistory,
      val: leads.reduce((acc, c) => acc + (c.followUpLogs?.length || 0), 0),
      icon: Clock,
      col: "text-amber-600 bg-amber-50",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {metrics.map((m, idx) => {
        const Icon = m.icon;
        return (
          <div key={idx} className="bg-white rounded-xl border border-slate-200 p-3 md:p-4 shadow-xs">
            <p className="text-xs text-slate-400 font-semibold">{m.title}</p>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-xl md:text-2xl font-black text-slate-800">{m.val}</span>
              <div className={`p-2 rounded-lg ${m.col}`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

StatsCards.displayName = "StatsCards";
