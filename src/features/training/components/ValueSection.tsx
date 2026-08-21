/**
 * 五位一体实战价值区
 * Value Section
 *
 * @module features/training/components/ValueSection
 */

import { Lightbulb, Search, BookMarked, Send, Link2 } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { SectionTitle } from "./SectionTitle";

export function ValueSection() {
  const { t } = useLocale();
  const items = [
    { icon: Lightbulb, title: t("tlValue1Title"), desc: t("tlValue1Desc") },
    { icon: Search, title: t("tlValue2Title"), desc: t("tlValue2Desc") },
    { icon: BookMarked, title: t("tlValue3Title"), desc: t("tlValue3Desc") },
    { icon: Send, title: t("tlValue4Title"), desc: t("tlValue4Desc") },
    { icon: Link2, title: t("tlValue5Title"), desc: t("tlValue5Desc") },
  ];

  return (
    <section className="py-4">
      <SectionTitle title={t("tlValueTitle")} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {items.map((item) => (
          <div key={item.title} className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-xs">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-teal-400">
              <item.icon className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-black text-slate-900">{item.title}</h3>
            <p className="text-xs leading-relaxed text-slate-500">{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

ValueSection.displayName = "ValueSection";
