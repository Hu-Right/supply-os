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
    <section id="intro" className="bg-[#F4F7FA]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <SectionTitle title={t("tlWhyTitle")} sub={t("tlWhySub")} />
        <div className="grid md:grid-cols-3 gap-6">
          {cards.map(({ icon: Icon, titleKey, descKey }) => (
            <div key={titleKey} className="rounded-xl border border-slate-200/80 bg-white p-7 shadow-xs">
              <div className="w-12 h-12 rounded-lg bg-[#12A171] flex items-center justify-center">
                <Icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="mt-5 text-base font-black text-[#0B2447]">{t(titleKey)}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{t(descKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
