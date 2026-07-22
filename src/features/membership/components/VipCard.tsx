/**
 * VIP 卡片组件
 * VIP Card Component
 *
 * @module features/membership/components/VipCard
 * @description VIP 会员展示卡片，包含状态显示和特权列表
 *              VIP member display card with status and privileges
 */

import { Crown } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { VIP_PRIVILEGES } from "../data";

export interface VipCardProps {
  userEmail: string;
  isVip: boolean;
  onUpgradeClick: () => void;
}

export function VipCard({ userEmail, isVip, onUpgradeClick }: VipCardProps) {
  const { t } = useLocale();

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-tr from-slate-950 via-slate-900 to-teal-950 p-6 text-white shadow-lg md:p-8">
      <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 translate-x-[20%] translate-y-[-20%] rounded-full bg-teal-500/10 blur-3xl" />

      <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
        <div className="space-y-2">
          <div className="inline-flex items-center space-x-1.5 rounded-full border border-amber-500/30 bg-amber-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-300">
            <Crown className="h-3.5 w-3.5" />
            <span>GOLD VIP ACCESS PANEL</span>
          </div>
          <h3 className="text-2xl font-extrabold text-white">
            {t("memberGoldTitle")}
          </h3>
          <p className="max-w-xl text-xs text-slate-400">
            {t("membershipVipDesc")}
          </p>
        </div>

        <div className="shrink-0 space-y-1.5 rounded-2xl border border-slate-700 bg-slate-800/80 p-4 text-center min-w-56">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {t("guestMode")}
          </p>
          <p className="font-mono text-sm font-bold text-teal-400">
            {userEmail}
          </p>

          <div className="pt-2">
            {isVip ? (
              <span className="inline-block rounded-full border border-emerald-500/30 bg-emerald-500/20 px-4 py-1.5 text-xs font-bold text-emerald-300">
                {t("alreadyVip")}
              </span>
            ) : (
              <button
                onClick={onUpgradeClick}
                className="w-full cursor-pointer rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 py-2 text-xs font-black text-slate-950 transition-colors hover:from-amber-500 hover:to-amber-600"
              >
                {t("upgradeToVip")}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 border-t border-slate-800 pt-8 md:grid-cols-4">
        {VIP_PRIVILEGES.map((priv, idx) => (
          <div
            key={idx}
            className="space-y-1 rounded-xl border border-slate-800/50 bg-slate-850 p-4"
          >
            <strong className="block text-xs font-bold text-teal-400">
              {t(priv.titleKey)}
            </strong>
            <p className="select-none text-[11px] leading-relaxed text-slate-400">
              {t(priv.descKey)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

VipCard.displayName = "VipCard";
