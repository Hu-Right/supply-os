/**
 * 平台介绍 — 核心优势区块
 * About Advantages — 4 core value propositions
 *
 * @module features/home/components/about/AboutAdvantages
 * @description 四列优势卡片：全球覆盖 / AI 匹配 / 投标支持 / 履约保障。
 */
import { Globe, Zap, Users, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLocale } from "@/core/i18n";

const ADVANTAGES: { icon: LucideIcon; titleKey: string; descKey: string; color: string }[] = [
  { icon: Globe, titleKey: "aboutAdv1Title", descKey: "aboutAdv1Desc", color: "bg-teal-50 text-teal-600" },
  { icon: Zap, titleKey: "aboutAdv2Title", descKey: "aboutAdv2Desc", color: "bg-blue-50 text-blue-600" },
  { icon: Users, titleKey: "aboutAdv3Title", descKey: "aboutAdv3Desc", color: "bg-violet-50 text-violet-600" },
  { icon: TrendingUp, titleKey: "aboutAdv4Title", descKey: "aboutAdv4Desc", color: "bg-emerald-50 text-emerald-600" },
];

export function AboutAdvantages() {
  const { t } = useLocale();
  return (
    <div className="bg-neutral-50/60 border-y border-neutral-100">
      <div className="max-w-5xl mx-auto px-6 sm:px-8 lg:px-8 py-20 md:py-24">
        <div className="text-center mb-14">
          <h3 className="text-2xl md:text-3xl font-semibold text-neutral-900 tracking-tight">
            {t("aboutAdvTitle")}
          </h3>
          <p className="mt-4 text-base text-neutral-500 max-w-xl mx-auto">
            {t("aboutAdvSubtitle")}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-10">
          {ADVANTAGES.map((a) => {
            const Icon = a.icon;
            return (
              <div key={a.titleKey} className="group">
                <div className={`w-11 h-11 rounded-xl ${a.color} flex items-center justify-center mb-5`}>
                  <Icon className="w-5 h-5" strokeWidth={1.5} />
                </div>
                <h4 className="text-base font-semibold text-neutral-900 mb-2">{t(a.titleKey)}</h4>
                <p className="text-sm text-neutral-500 leading-relaxed">{t(a.descKey)}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
