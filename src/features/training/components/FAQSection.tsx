/**
 * 常见问题区（折叠面板，DB 驱动）
 * FAQ Section
 *
 * @module features/training/components/FAQSection
 * @description 无数据时不渲染。
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { SectionTitle } from "./SectionTitle";
import type { LandingFaq } from "../api";

export interface FAQSectionProps {
  faqs: LandingFaq[];
}

export function FAQSection({ faqs }: FAQSectionProps) {
  const { t, locale } = useLocale();
  const [openId, setOpenId] = useState<number | null>(null);
  if (faqs.length === 0) return null;

  return (
    <section className="py-4">
      <SectionTitle title={t("tlFAQTitle")} />
      <div className="space-y-3">
        {faqs.map((f) => {
          const open = openId === f.id;
          return (
            <div key={f.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : f.id)}
                className="flex w-full items-center justify-between p-4 text-left"
              >
                <span className="text-sm font-black text-slate-900">
                  {pickLocale(locale, f.question_zh, f.question_en ?? f.question_zh)}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
              {open && (
                <div className="border-t border-slate-100 p-4 text-sm leading-relaxed text-slate-600">
                  {pickLocale(locale, f.answer_zh, f.answer_en ?? f.answer_zh)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

FAQSection.displayName = "FAQSection";
