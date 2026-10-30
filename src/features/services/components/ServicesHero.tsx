/**
 * 投标服务市场 — Hero 页头 + 4步生命周期步骤条
 * Services Hero Section with 4-step lifecycle bar
 *
 * @module features/services/components/ServicesHero
 */

import { FileText, ClipboardList, Send, Award } from "lucide-react";
import { useLocale } from "@/core/i18n";

const PHASES = [
  { key: "pre-bid", labelKey: "svcPhasePreBid", subKey: "svcPhasePreBidSub", icon: FileText },
  { key: "prep", labelKey: "svcPhasePrep", subKey: "svcPhasePrepSub", icon: ClipboardList },
  { key: "submit", labelKey: "svcPhaseSubmit", subKey: "svcPhaseSubmitSub", icon: Send },
  { key: "post-award", labelKey: "svcPhasePostAward", subKey: "svcPhasePostAwardSub", icon: Award },
];

export function ServicesHero() {
  const { t } = useLocale();
  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0a1628] via-[#0f2035] to-[#0d2847] px-6 sm:px-8 py-10 md:py-14">
      {/* 右侧地球装饰 */}
      <div className="absolute right-0 top-0 w-[40%] h-full opacity-20 pointer-events-none">
        <div className="absolute right-[-10%] top-[-20%] w-[80%] h-[140%] rounded-full border border-teal-500/20" />
        <div className="absolute right-[-5%] top-[-10%] w-[60%] h-[120%] rounded-full border border-teal-400/10" />
        <div className="absolute right-[5%] top-[10%] w-[40%] h-[80%] rounded-full bg-gradient-to-br from-teal-500/10 to-transparent" />
      </div>

      <div className="relative z-10">
        <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-white tracking-tight">
          {t("svcHeroTitle")}
        </h1>
        <p className="mt-3 text-sm md:text-base text-slate-400 max-w-2xl leading-relaxed">
          {t("svcHeroSubtitle")}
        </p>

        {/* 4步生命周期步骤条 */}
        <div className="mt-8 md:mt-10 flex items-stretch gap-0 overflow-x-auto">
          {PHASES.map((phase, idx) => {
            const Icon = phase.icon;
            const isActive = idx === 0;
            return (
              <div key={phase.key} className="flex items-center flex-1 min-w-0">
                {/* 步骤块 */}
                <div
                  className={`relative flex items-center gap-3 px-4 py-3 rounded-xl flex-1 min-w-0 transition-all ${
                    isActive
                      ? "bg-teal-600/90 shadow-lg shadow-teal-900/30"
                      : "bg-white/5 border border-white/10"
                  }`}
                >
                  {/* 编号圆圈 */}
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-extrabold ${
                      isActive
                        ? "bg-white text-teal-700"
                        : "bg-white/10 text-slate-400 border border-white/20"
                    }`}
                  >
                    {idx + 1}
                  </div>
                  <div className="min-w-0">
                    <div
                      className={`text-sm font-bold truncate ${
                        isActive ? "text-white" : "text-slate-300"
                      }`}
                    >
                      {t(phase.labelKey)}
                    </div>
                    <div
                      className={`text-xs truncate ${
                        isActive ? "text-teal-100" : "text-slate-500"
                      }`}
                    >
                      {t(phase.subKey)}
                    </div>
                  </div>
                  <Icon
                    className={`flex-shrink-0 w-4 h-4 ml-auto ${
                      isActive ? "text-white/60" : "text-slate-600"
                    }`}
                  />
                </div>

                {/* 箭头连接 */}
                {idx < PHASES.length - 1 && (
                  <div className="flex-shrink-0 mx-1 text-slate-600">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M6 3L11 8L6 13"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

ServicesHero.displayName = "ServicesHero";
