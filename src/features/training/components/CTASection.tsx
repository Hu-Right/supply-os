/**
 * 底部行动区（设计图 1:1 深藏青横幅）
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
    <section className="bg-[#022250]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="text-center md:text-left">
          <h3 className="text-2xl md:text-3xl font-black text-white tracking-wide">{t("tlCtaTitle")}</h3>
          <p className="mt-3 text-sm text-slate-300">{t("tlCtaSub")}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          <button
            type="button"
            onClick={onEnroll}
            className="rounded-md bg-[#0CAF8C] px-8 py-3 text-sm font-black text-white hover:bg-[#0A9B7C] cursor-pointer"
          >
            {t("tlCtaBtn1")}
          </button>
          <button
            type="button"
            onClick={onConsult}
            className="rounded-md border border-slate-400/70 px-8 py-3 text-sm font-black text-slate-100 hover:bg-white/10 cursor-pointer"
          >
            {t("tlCtaBtn2")}
          </button>
        </div>
      </div>
    </section>
  );
}
