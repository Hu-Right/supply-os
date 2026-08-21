/**
 * 数据统计条（12 / 2000+ / 50+ / 100+）
 * Stats Section
 *
 * @module features/training/components/StatsSection
 */

import { BookOpen, Globe2, FileSearch, Building2 } from "lucide-react";
import { useLocale } from "@/core/i18n";

export function StatsSection() {
  const { t } = useLocale();
  const stats = [
    { icon: BookOpen, value: "12", label: t("tlStatModules") },
    { icon: Globe2, value: "2000+", label: t("tlStatOrders") },
    { icon: FileSearch, value: "50+", label: t("tlStatCases") },
    { icon: Building2, value: "100+", label: t("tlStatMentors") },
  ];

  return (
    <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xs">
          <s.icon className="h-6 w-6 text-teal-600" />
          <div className="text-2xl font-black text-slate-900">{s.value}</div>
          <div className="text-xs font-bold text-slate-500">{s.label}</div>
        </div>
      ))}
    </section>
  );
}

StatsSection.displayName = "StatsSection";
