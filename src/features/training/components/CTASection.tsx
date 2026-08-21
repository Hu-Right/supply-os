/**
 * 底部 CTA 区（每月20日，杭州见 + 双按钮）
 * CTA Section
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
    <section className="overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-8 text-white md:p-12">
      <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
        <div className="text-center md:text-left">
          <h2 className="text-2xl font-black md:text-3xl">{t("tlCTATitle")}</h2>
          <p className="mt-2 text-sm text-slate-300">{t("tlCTADesc")}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          <button
            type="button"
            onClick={onEnroll}
            className="rounded-xl bg-teal-500 px-8 py-3.5 text-sm font-black text-slate-900 shadow-lg shadow-teal-500/30 hover:bg-teal-400"
          >
            {t("tlBtnEnroll")}
          </button>
          <button
            type="button"
            onClick={onConsult}
            className="rounded-xl border border-white/30 bg-white/5 px-8 py-3.5 text-sm font-black text-white hover:bg-white/10"
          >
            {t("tlBtnConsult")}
          </button>
        </div>
      </div>
    </section>
  );
}

CTASection.displayName = "CTASection";
