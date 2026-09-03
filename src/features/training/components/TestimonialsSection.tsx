/**
 * 学员反馈（设计图 1:1 三引言卡）
 * Testimonials section
 *
 * @module features/training/components/TestimonialsSection
 * @description 文案前端写死并走 i18n（六语言 training.json 的 tlTest* key），不再查库。
 */
import { Quote } from "lucide-react";
import { useLocale, type LocaleKey } from "@/core/i18n";
import { SectionTitle } from "./landing-ui";

/** 学员反馈条目（引言/署名 i18n key，文案在六语言 training.json） */
const TESTIMONIAL_ITEMS: { quoteKey: LocaleKey; authorKey: LocaleKey }[] = [
  { quoteKey: "tlTest1Quote", authorKey: "tlTest1Author" },
  { quoteKey: "tlTest2Quote", authorKey: "tlTest2Author" },
  { quoteKey: "tlTest3Quote", authorKey: "tlTest3Author" },
];

export function TestimonialsSection() {
  const { t } = useLocale();

  return (
    <section id="testimonials" className="bg-training-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <SectionTitle title={t("tlTestTitle")} />
        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIAL_ITEMS.map(({ quoteKey, authorKey }) => (
            <div key={quoteKey} className="rounded-lg border border-training-border bg-white p-7 shadow-card-soft flex flex-col">
              <Quote className="w-8 h-8 text-training-green" fill="currentColor" />
              <p className="mt-4 flex-1 text-sm leading-relaxed text-training-navy">
                {t(quoteKey)}
              </p>
              <p className="mt-5 text-right text-xs font-black text-[#069E78]">
                {t(authorKey)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
