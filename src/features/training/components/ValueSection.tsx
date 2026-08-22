/**
 * 五位一体实战价值（设计图 1:1 五圆标）
 * Five-in-one value section
 *
 * @module features/training/components/ValueSection
 */
import { Brain, Search, FileText, Send, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLocale, type LocaleKey } from "@/core/i18n";
import { SectionTitle } from "./landing-ui";

export function ValueSection() {
  const { t } = useLocale();
  const items: { icon: LucideIcon; titleKey: LocaleKey; descKey: LocaleKey }[] = [
    { icon: Brain, titleKey: "tlValue1Title", descKey: "tlValue1Desc" },
    { icon: Search, titleKey: "tlValue2Title", descKey: "tlValue2Desc" },
    { icon: FileText, titleKey: "tlValue3Title", descKey: "tlValue3Desc" },
    { icon: Send, titleKey: "tlValue4Title", descKey: "tlValue4Desc" },
    { icon: Users, titleKey: "tlValue5Title", descKey: "tlValue5Desc" },
  ];

  return (
    <section className="bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-24">
        <SectionTitle title={t("tlValueTitle")} />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10">
          {items.map(({ icon: Icon, titleKey, descKey }) => (
            <div key={titleKey} className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                <Icon className="w-7 h-7 text-slate-600" strokeWidth={1.5} />
              </div>
              <h3 className="mt-5 text-sm font-bold text-slate-900">{t(titleKey)}</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{t(descKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
