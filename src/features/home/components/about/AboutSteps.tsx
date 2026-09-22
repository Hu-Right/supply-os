/**
 * 平台介绍 — 四步路径区块
 * About Steps — 4-step product path (Search → Match → Bid → Fulfill)
 *
 * @module features/home/components/about/AboutSteps
 */
import { Search, Sparkles, FileCheck, ShieldCheck } from "lucide-react";
import { useLocale } from "@/core/i18n";

const STEPS: { icon: typeof Search; titleKey: string; descKey: string; color: string }[] = [
  { icon: Search, titleKey: "aboutStep1Title", descKey: "aboutStep1Desc", color: "bg-teal-50 text-teal-600" },
  { icon: Sparkles, titleKey: "aboutStep2Title", descKey: "aboutStep2Desc", color: "bg-blue-50 text-blue-600" },
  { icon: FileCheck, titleKey: "aboutStep3Title", descKey: "aboutStep3Desc", color: "bg-amber-50 text-amber-600" },
  { icon: ShieldCheck, titleKey: "aboutStep4Title", descKey: "aboutStep4Desc", color: "bg-emerald-50 text-emerald-600" },
];

export function AboutSteps() {
  const { t } = useLocale();
  return (
    <div className="bg-white">
      <div className="max-w-4xl mx-auto px-6 sm:px-8 lg:px-8 py-20 md:py-24">
        <div className="text-center mb-14">
          <h3 className="text-2xl md:text-3xl font-semibold text-neutral-900 tracking-tight">
            {t("aboutStepsTitle")}
          </h3>
          <p className="mt-4 text-base text-neutral-500">{t("aboutStepsSubtitle")}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div key={step.titleKey} className="relative flex flex-col items-center text-center">
                {idx < STEPS.length - 1 && (
                  <div className="hidden md:block absolute top-5 left-[55%] w-[90%] h-px bg-neutral-200" />
                )}
                <div className={`w-11 h-11 rounded-xl ${step.color} flex items-center justify-center mb-4`}>
                  <Icon className="w-5 h-5" strokeWidth={1.5} />
                </div>
                <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">
                  Step {idx + 1}
                </span>
                <h4 className="text-sm font-semibold text-neutral-900">{t(step.titleKey)}</h4>
                <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed">{t(step.descKey)}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
