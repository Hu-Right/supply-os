/**
 * 数据背书条（设计图 1:1 白底四指标）
 * Stats band
 *
 * @module features/training/components/StatsSection
 */
import { BookOpen, Layers, FileSearch, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLocale, type LocaleKey } from "@/core/i18n";

export function StatsSection() {
  const { t } = useLocale();
  const items: { icon: LucideIcon; numKey: LocaleKey; labelKey: LocaleKey }[] = [
    { icon: BookOpen, numKey: "tlStat1Num", labelKey: "tlStat1Label" },
    { icon: Layers, numKey: "tlStat2Num", labelKey: "tlStat2Label" },
    { icon: FileSearch, numKey: "tlStat3Num", labelKey: "tlStat3Label" },
    { icon: Users, numKey: "tlStat4Num", labelKey: "tlStat4Label" },
  ];

  return (
    <section className="bg-white border-b border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
        {items.map(({ icon: Icon, numKey, labelKey }) => (
          <div key={numKey} className="flex items-center justify-center gap-4">
            <Icon className="w-8 h-8 text-[#0A2A55]" strokeWidth={1.6} />
            <div>
              <p className="text-2xl md:text-3xl font-black text-[#0A2A55]">{t(numKey)}</p>
              <p className="mt-1 text-xs md:text-sm text-slate-600">{t(labelKey)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
