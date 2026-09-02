/**
 * 底部行动区（柔和内嵌卡片，与页面视觉连贯）
 * CTA band
 *
 * @module features/training/components/CTASection
 */
import { useLocale } from "@/core/i18n";

export interface CTASectionProps {
  onEnroll: () => void;
  onConsult: () => void;
}

export function CTASection({ onEnroll, onConsult }: CTASectionProps) {
  const { t } = useLocale();

  return (
    <section className="bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="rounded-2xl border border-training-border bg-gradient-to-r from-training-bg to-white p-8 md:p-10 flex flex-col md:flex-row items-center gap-6 md:gap-10">
          {/* 左侧文案 */}
          <div className="flex-1 text-center md:text-left">
            <h3 className="text-2xl md:text-3xl font-black text-[#0A245E] tracking-wide">
              {t("tlCtaTitle")}
            </h3>
            <p className="mt-3 text-sm text-[#3E5070]">{t("tlCtaSub")}</p>
          </div>

          {/* 右侧按钮 */}
          <div className="flex flex-wrap justify-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onEnroll}
              className="rounded-lg bg-training-green px-7 py-2.5 text-sm font-black text-white hover:bg-training-green-hover transition-colors cursor-pointer"
            >
              {t("tlCtaBtn1")}
            </button>
            <button
              type="button"
              onClick={onConsult}
              className="rounded-lg border border-[#287986]/40 px-7 py-2.5 text-sm font-black text-[#0B7F82] hover:bg-[#018B8B]/5 transition-colors cursor-pointer"
            >
              {t("tlCtaBtn2")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
