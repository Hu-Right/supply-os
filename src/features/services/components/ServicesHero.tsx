/**
 * 投标服务市场 — Hero 页头 + 4步生命周期步骤条
 * Services Hero Section with 4-step lifecycle bar
 *
 * @module features/services/components/ServicesHero
 */

import { FileText, ClipboardList, Send, Award } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { HeroPanel } from "@/shared/ui";

const PHASES = [
  { key: "pre-bid", labelKey: "svcPhasePreBid", subKey: "svcPhasePreBidSub", icon: FileText },
  { key: "prep", labelKey: "svcPhasePrep", subKey: "svcPhasePrepSub", icon: ClipboardList },
  { key: "submit", labelKey: "svcPhaseSubmit", subKey: "svcPhaseSubmitSub", icon: Send },
  { key: "post-award", labelKey: "svcPhasePostAward", subKey: "svcPhasePostAwardSub", icon: Award },
];

export function ServicesHero() {
  const { t } = useLocale();
  return (
    <HeroPanel title={t("svcHeroTitle")} description={t("svcHeroSubtitle")}>
      {/* 4步生命周期步骤条 */}
      <div className="flex items-stretch gap-0 overflow-x-auto">
        {PHASES.map((phase, idx) => {
          const Icon = phase.icon;
          const isActive = idx === 0;
          return (
            <div key={phase.key} className="flex min-w-0 flex-1 items-center">
              <div
                className={`relative flex min-w-0 flex-1 items-center gap-3 rounded-xl px-4 py-3 transition-all ${
                  isActive
                    ? "bg-primary-600/90 shadow-lg shadow-primary-950/30"
                    : "border border-white/10 bg-white/5"
                }`}
              >
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${
                    isActive
                      ? "bg-white text-primary-700"
                      : "border border-white/20 bg-white/10 text-secondary-400"
                  }`}
                >
                  {idx + 1}
                </div>
                <div className="min-w-0">
                  <div className={`truncate text-sm font-bold ${isActive ? "text-white" : "text-secondary-300"}`}>
                    {t(phase.labelKey)}
                  </div>
                  <div className={`truncate text-xs ${isActive ? "text-primary-100" : "text-secondary-500"}`}>
                    {t(phase.subKey)}
                  </div>
                </div>
                <Icon
                  className={`ml-auto h-4 w-4 flex-shrink-0 ${isActive ? "text-white/60" : "text-secondary-600"}`}
                />
              </div>

              {idx < PHASES.length - 1 && (
                <div className="mx-1 flex-shrink-0 text-secondary-600">
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
    </HeroPanel>
  );
}

ServicesHero.displayName = "ServicesHero";
