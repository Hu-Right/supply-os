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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <div className="rounded-3xl border border-slate-100 bg-gradient-to-r from-[#FAFBFC] to-white p-10 md:p-14 flex flex-col md:flex-row items-center gap-8 md:gap-12 shadow-[0_2px_16px_rgba(0,0,0,0.04)]">
          {/* 左侧文案 */}
          <div className="flex-1 text-center md:text-left">
            <h3 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">
              {t("tlCtaTitle")}
            </h3>
            <p className="mt-4 text-base text-slate-500">{t("tlCtaSub")}</p>
          </div>

          {/* 右侧按钮 */}
          <div className="flex flex-wrap justify-center gap-4 shrink-0">
            <button
              type="button"
              onClick={onEnroll}
              className="rounded-full bg-[#0CAF8C] px-8 py-3.5 text-sm font-semibold text-white hover:bg-[#0A9B7C] hover:scale-105 transition-all duration-200 cursor-pointer shadow-sm"
            >
              {t("tlCtaBtn1")}
            </button>
            <button
              type="button"
              onClick={onConsult}
              className="rounded-full border border-slate-200 px-8 py-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 cursor-pointer"
            >
              {t("tlCtaBtn2")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
