/**
 * 讲师价值亮点区（懂规则 / 懂实操 / 懂转化）
 * Highlights Section
 *
 * @module features/training/components/HighlightsSection
 */

import { Scale, Wrench, RefreshCcw } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { SectionTitle } from "./SectionTitle";

export function HighlightsSection() {
  const { t } = useLocale();
  const items = [
    { icon: Scale, title: t("tlHighlight1Title"), desc: t("tlHighlight1Desc") },
    { icon: Wrench, title: t("tlHighlight2Title"), desc: t("tlHighlight2Desc") },
    { icon: RefreshCcw, title: t("tlHighlight3Title"), desc: t("tlHighlight3Desc") },
  ];

  return (
    <section className="py-4">
      <SectionTitle title={t("tlHighlightsTitle")} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.title} className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white">
              <item.icon className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">{item.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

HighlightsSection.displayName = "HighlightsSection";
