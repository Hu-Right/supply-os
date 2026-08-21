/**
 * 价值主张区（为什么外贸企业更需要了解国际公共采购）
 * Why Section
 *
 * @module features/training/components/WhySection
 */

import { TrendingUp, ShieldCheck, Layers } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { SectionTitle } from "./SectionTitle";

export function WhySection() {
  const { t } = useLocale();
  const items = [
    { icon: TrendingUp, title: t("tlWhy1Title"), desc: t("tlWhy1Desc") },
    { icon: ShieldCheck, title: t("tlWhy2Title"), desc: t("tlWhy2Desc") },
    { icon: Layers, title: t("tlWhy3Title"), desc: t("tlWhy3Desc") },
  ];

  return (
    <section className="py-4">
      <SectionTitle title={t("tlWhyTitle")} subtitle={t("tlWhySubtitle")} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-teal-600 text-white">
              <item.icon className="h-5 w-5" />
            </div>
            <h3 className="text-base font-black text-slate-900">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

WhySection.displayName = "WhySection";
