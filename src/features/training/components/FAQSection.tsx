/**
 * 常见问题（设计图 1:1 手风琴）
 * FAQ section
 *
 * @module features/training/components/FAQSection
 */
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { SectionTitle } from "./landing-ui";
import type { LandingFaq } from "../api";

export function FAQSection({ faqs }: { faqs: LandingFaq[] }) {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState<number | null>(0);
  if (faqs.length === 0) return null;

  return (
    <section id="faq" className="bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-24">
        <SectionTitle title={t("tlFaqTitle")} />
        <div className="divide-y divide-slate-100">
          {faqs.map((f, i) => (
            <div key={f.id}>
              <button
                type="button"
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between gap-4 py-6 text-left cursor-pointer group"
              >
                <span className="text-base font-semibold text-slate-900 group-hover:text-slate-700 transition-colors">{pickLocale(locale, f.question_zh, f.question_en)}</span>
                <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 ${open === i ? "rotate-180" : ""}`} />
              </button>
              {open === i && (
                <p className="pb-6 text-sm leading-relaxed text-slate-500">{pickLocale(locale, f.answer_zh, f.answer_en)}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
