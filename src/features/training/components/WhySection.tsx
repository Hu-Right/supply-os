/**
 * 为什么外贸企业更需要了解国际公共采购（设计图 1:1 三卡片）
 * Why section
 *
 * @module features/training/components/WhySection
 */
import { TrendingUp, ShieldCheck, Target } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLocale, type LocaleKey } from "@/core/i18n";
import { SectionTitle } from "./landing-ui";

export function WhySection() {
  const { t } = useLocale();
  const cards: { icon: LucideIcon; titleKey: LocaleKey; descKey: LocaleKey }[] = [
    { icon: TrendingUp, titleKey: "tlWhy1Title", descKey: "tlWhy1Desc" },
    { icon: ShieldCheck, titleKey: "tlWhy2Title", descKey: "tlWhy2Desc" },
    { icon: Target, titleKey: "tlWhy3Title", descKey: "tlWhy3Desc" },
  ];

  return (
    <section id="intro" className="bg-[#FAFBFC]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-24">
        <SectionTitle title={t("tlWhyTitle")} sub={t("tlWhySub")} />
        <div className="grid md:grid-cols-3 gap-8">
          {cards.map(({ icon: Icon, titleKey, descKey }) => (
            <div key={titleKey} className="rounded-2xl bg-white p-8 shadow-[0_2px_16px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_24px_rgba(0,0,0,0.06)] transition-shadow duration-300">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                <Icon className="w-6 h-6 text-slate-600" strokeWidth={1.5} />
              </div>
              <h3 className="mt-6 text-lg font-bold text-slate-900">{t(titleKey)}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-500">{t(descKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
