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
    <section id="testimonials" className="bg-[#F4F7FA]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <SectionTitle title={t("tlTestTitle")} />
        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200/80 bg-white p-7 shadow-xs flex flex-col">
              <Quote className="w-8 h-8 text-[#12A171]" fill="currentColor" />
              <p className="mt-4 flex-1 text-sm leading-relaxed text-[#0B2447]">
                {pickLocale(locale, item.quote_zh, item.quote_en)}
              </p>
              <p className="mt-5 text-right text-xs font-black text-[#0E7C6B]">
                {item.author_name}
                {item.author_title && <span className="ml-1 font-bold text-slate-500">{item.author_title}</span>}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
