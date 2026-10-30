"use client";

/**
 * RFQ 浅色 Hero 区
 * RFQ Light Hero Section
 *
 * @module features/rfq/components/LightHero
 * @description 浅色渐变页头：标题 + 双 CTA + 能力标签。深色文字，品牌绿仅用于主 CTA。
 */
import { Crosshair, Globe, AlertTriangle, Languages, Send } from "lucide-react";

import { Button } from "@/shared/ui";
import { useLocale } from "@/core/i18n";
import { emitAppEvent } from "@/core/events";

const FEATURES = [
  { icon: Globe, labelKey: "rfqVisibilityPublic" },
  { icon: Crosshair, labelKey: "rfqVisibilityTargeted" },
  { icon: AlertTriangle, labelKey: "rfqFeatureUrgent" },
  { icon: Languages, labelKey: "rfqFeatureMultilang" },
];

export function LightHero() {
  const { t } = useLocale();
  return (
    <section className="relative overflow-hidden rounded-2xl border border-secondary-200 bg-gradient-to-br from-white via-primary-50/50 to-white px-6 sm:px-8 py-8 md:py-10">
      <div className="relative z-10">
        <h1 className="text-2xl md:text-3xl font-extrabold text-secondary-900 tracking-tight">
          {t("rfqHeroTitle")}
        </h1>
        <p className="text-secondary-500 text-sm md:text-base mt-3 max-w-2xl leading-relaxed">
          {t("rfqHeroSubtitle")}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            size="lg"
            onClick={() => document.getElementById("rfq-form")?.scrollIntoView({ behavior: "smooth" })}
          >
            <Send className="w-4 h-4" /> {t("rfqHeroCtaPublish")}
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => emitAppEvent("supply-os:consult")}
          >
            {t("rfqConsultCta")}
          </Button>
        </div>

        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-secondary-500">
          {FEATURES.map(({ icon: Icon, labelKey }) => (
            <span key={labelKey} className="flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5 text-primary-600" /> {t(labelKey)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
