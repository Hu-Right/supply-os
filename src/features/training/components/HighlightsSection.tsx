/**
 * 讲师价值亮点（设计图 1:1 三卡片）
 * Highlights section
 *
 * @module features/training/components/HighlightsSection
 */
import { ScrollText, BadgeCheck, Network } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLocale, type LocaleKey } from "@/core/i18n";
import { SectionTitle } from "./landing-ui";

export function HighlightsSection() {
  const { t } = useLocale();
  const cards: { icon: LucideIcon; titleKey: LocaleKey; descKey: LocaleKey }[] = [
    { icon: ScrollText, titleKey: "tlHl1Title", descKey: "tlHl1Desc" },
    { icon: BadgeCheck, titleKey: "tlHl2Title", descKey: "tlHl2Desc" },
    { icon: Network, titleKey: "tlHl3Title", descKey: "tlHl3Desc" },
  ];

  return (
    <section className="bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 md:pb-24">
        <SectionTitle title={t("tlHlTitle")} />
        <div className="grid md:grid-cols-3 gap-8">
          {cards.map(({ icon: Icon, titleKey, descKey }) => (
            <div key={titleKey} className="rounded-2xl bg-white p-7 shadow-[0_2px_16px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_24px_rgba(0,0,0,0.06)] transition-shadow duration-300 flex items-start gap-5">
              <span className="w-12 h-12 shrink-0 rounded-xl bg-slate-100 flex items-center justify-center">
                <Icon className="w-6 h-6 text-slate-600" strokeWidth={1.5} />
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900">{t(titleKey)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{t(descKey)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
