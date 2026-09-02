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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 md:pb-20">
        <SectionTitle title={t("tlHlTitle")} />
        <div className="grid md:grid-cols-3 gap-6">
          {cards.map(({ icon: Icon, titleKey, descKey }) => (
            <div key={titleKey} className="rounded-lg border border-training-border bg-white p-6 shadow-card-soft flex items-start gap-4">
              <span className="w-12 h-12 shrink-0 rounded-full bg-[#1E96A5] flex items-center justify-center">
                <Icon className="w-6 h-6 text-white" />
              </span>
              <div>
                <h3 className="text-base font-black text-training-navy">{t(titleKey)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{t(descKey)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
