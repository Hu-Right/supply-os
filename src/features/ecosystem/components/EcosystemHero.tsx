/**
 * 第三方服务生态 — 页头 Hero
 * Ecosystem Hero
 *
 * @module features/ecosystem/components/EcosystemHero
 * @description 独立模块 /ecosystem 的页头：深藏青渐变 + 标题/徽章/描述。
 *              与 ServicesHero 同视觉语言（同色系渐变），但无步骤条。
 */

import { useLocale } from "@/core/i18n";

export function EcosystemHero() {
  const { t } = useLocale();
  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0a1628] via-[#0f2035] to-[#0d2847] px-6 sm:px-8 py-10 md:py-14">
      {/* 右侧装饰圆环（同 ServicesHero 视觉语言） */}
      <div className="absolute right-0 top-0 w-[40%] h-full opacity-20 pointer-events-none">
        <div className="absolute right-[-10%] top-[-20%] w-[80%] h-[140%] rounded-full border border-teal-500/20" />
        <div className="absolute right-[-5%] top-[-10%] w-[60%] h-[120%] rounded-full border border-teal-400/10" />
        <div className="absolute right-[5%] top-[10%] w-[40%] h-[80%] rounded-full bg-gradient-to-br from-teal-500/10 to-transparent" />
      </div>

      <div className="relative z-10">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-white tracking-tight">
            {t("svcEcoTitle")}
          </h1>
          <span className="px-2.5 py-1 rounded-full bg-teal-600/20 border border-teal-400/30 text-teal-200 text-xs font-bold">
            {t("svcEcoBadge")}
          </span>
        </div>
        <p className="mt-3 text-sm md:text-base text-slate-400 max-w-2xl leading-relaxed">
          {t("svcEcoDesc")}
        </p>
      </div>
    </section>
  );
}

EcosystemHero.displayName = "EcosystemHero";
