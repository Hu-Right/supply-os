/**
 * 投标服务市场 — 信任条
 * Trust Bar — 4 trust indicators
 *
 * @module features/services/components/TrustBar
 */

import { Users, Clock, BadgeCheck, Shield } from "lucide-react";
import { useLocale } from "@/core/i18n";

const TRUST_ITEMS = [
  {
    icon: Users,
    titleKey: "svcTrustTeamTitle",
    descKey: "svcTrustTeamDesc",
  },
  {
    icon: Clock,
    titleKey: "svcTrustDeliveryTitle",
    descKey: "svcTrustDeliveryDesc",
  },
  {
    icon: BadgeCheck,
    titleKey: "svcTrustPricingTitle",
    descKey: "svcTrustPricingDesc",
  },
  {
    icon: Shield,
    titleKey: "svcTrustSecurityTitle",
    descKey: "svcTrustSecurityDesc",
  },
];

export function TrustBar() {
  const { t } = useLocale();
  return (
    <section className="rounded-2xl bg-gradient-to-r from-[#0a1628] via-[#0f2035] to-[#0d2847] px-6 sm:px-8 py-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        {TRUST_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.titleKey} className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center">
                <Icon className="w-5 h-5 text-teal-400" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white mb-0.5">
                  {t(item.titleKey)}
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {t(item.descKey)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

TrustBar.displayName = "TrustBar";
