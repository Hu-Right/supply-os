/**
 * 学员反馈（设计图 1:1 三引言卡）
 * Testimonials section
 *
 * @module features/training/components/TestimonialsSection
 * @description 数据已改为前端静态写死，避免数据库查询影响体验。
 */
import { Quote } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { SectionTitle } from "./landing-ui";
import { TESTIMONIALS } from "@/data/training-testimonials";

export function TestimonialsSection() {
  const { t, locale } = useLocale();
  if (TESTIMONIALS.length === 0) return null;

  return (
    <section id="testimonials" className="bg-training-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <SectionTitle title={t("tlTestTitle")} />
        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((item) => (
            <div key={item.id} className="rounded-lg border border-training-border bg-white p-7 shadow-card-soft flex flex-col">
              <Quote className="w-8 h-8 text-training-green" fill="currentColor" />
              <p className="mt-4 flex-1 text-sm leading-relaxed text-training-navy">
                {pickLocale(locale, item.quote_zh, item.quote_en)}
              </p>
              <p className="mt-5 text-right text-xs font-black text-[#069E78]">
                {locale === "zh" ? item.author_name : item.author_title || item.author_name}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
