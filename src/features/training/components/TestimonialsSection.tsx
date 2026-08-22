/**
 * 学员反馈（设计图 1:1 三引言卡）
 * Testimonials section
 *
 * @module features/training/components/TestimonialsSection
 */
import { Quote } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { SectionTitle } from "./landing-ui";
import type { LandingTestimonial } from "../api";

export function TestimonialsSection({ testimonials }: { testimonials: LandingTestimonial[] }) {
  const { t, locale } = useLocale();
  if (testimonials.length === 0) return null;

  return (
    <section id="testimonials" className="bg-[#FAFBFC]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-24">
        <SectionTitle title={t("tlTestTitle")} />
        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((item) => (
            <div key={item.id} className="rounded-2xl bg-white p-8 shadow-[0_2px_16px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_24px_rgba(0,0,0,0.06)] transition-shadow duration-300 flex flex-col">
              <Quote className="w-8 h-8 text-slate-300" fill="currentColor" />
              <p className="mt-5 flex-1 text-sm leading-relaxed text-slate-600">
                {pickLocale(locale, item.quote_zh, item.quote_en)}
              </p>
              <p className="mt-6 text-right text-xs font-bold text-slate-400">
                {locale === "zh" ? item.author_name : item.author_title || item.author_name}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
