/**
 * 学员反馈区（DB 驱动）
 * Testimonials Section
 *
 * @module features/training/components/TestimonialsSection
 * @description 无数据时不渲染。
 */

import { Quote } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { SectionTitle } from "./SectionTitle";
import type { LandingTestimonial } from "../api";

export interface TestimonialsSectionProps {
  testimonials: LandingTestimonial[];
}

export function TestimonialsSection({ testimonials }: TestimonialsSectionProps) {
  const { t, locale } = useLocale();
  if (testimonials.length === 0) return null;

  return (
    <section className="py-4">
      <SectionTitle title={t("tlTestimonialsTitle")} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {testimonials.map((item) => (
          <div key={item.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <Quote className="mb-3 h-6 w-6 text-teal-500" />
            <p className="flex-1 text-sm leading-relaxed text-slate-600">
              {pickLocale(locale, item.quote_zh, item.quote_en ?? item.quote_zh)}
            </p>
            <div className="mt-4 text-right">
              <p className="text-sm font-black text-slate-900">{item.author_name}</p>
              {item.author_title && <p className="text-xs text-slate-400">{item.author_title}</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

TestimonialsSection.displayName = "TestimonialsSection";
