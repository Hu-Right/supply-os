/**
 * 平台介绍 — Hero 区 + 数据指标
 * About Hero — Platform intro + scale metrics
 *
 * @module features/home/components/about/AboutHero
 * @description 品牌标语 + 4 个核心数据指标卡片，消费 useHomeStats。
 */
import { formatCompactNumber } from "@/shared/utils/format";
import { useLocale } from "@/core/i18n";
import { useHomeStats } from "../../hooks/useHomeStats";

export function AboutHero() {
  const { t } = useLocale();
  const { noticeActive, countryCount, certifiedSupplierCount } = useHomeStats();

  const metrics = [
    { value: formatCompactNumber(noticeActive), label: t("aboutM1Label"), sub: t("aboutM1Sub") },
    { value: `${countryCount}+`, label: t("aboutM2Label"), sub: t("aboutM2Sub") },
    { value: formatCompactNumber(certifiedSupplierCount), label: t("aboutM3Label"), sub: t("aboutM3Sub") },
    { value: "13.5万亿$", label: t("aboutM4Label"), sub: t("aboutM4Sub") },
  ];

  return (
    <>
      {/* ── Hero 区 ── */}
      <div className="max-w-5xl mx-auto px-6 sm:px-8 lg:px-8 pt-20 pb-12 md:pt-28 md:pb-16 text-center">
        <p className="text-5xl font-semibold text-teal-600 tracking-widest uppercase mb-5">
          {t("aboutBrand")}
        </p>
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-neutral-900 tracking-tight leading-tight">
          {t("aboutHeroTitleA")}
          <br className="hidden sm:block" />
          <span className="text-teal-600"> {t("aboutHeroTitleB")}</span>
        </h2>
        <p className="mt-6 text-base md:text-lg text-neutral-500 max-w-2xl mx-auto leading-relaxed">
          {t("aboutHeroDesc")}
        </p>
      </div>

      {/* ── 数据指标 ── */}
      <div className="max-w-4xl mx-auto px-6 sm:px-8 lg:px-8 pb-20 md:pb-24">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-2xl border border-neutral-100 bg-white p-6 md:p-7 text-center shadow-sm">
              <p className="text-2xl md:text-3xl font-bold text-teal-600 tracking-tight">
                {m.value}
              </p>
              <p className="mt-2 text-sm font-semibold text-neutral-800">{m.label}</p>
              <p className="mt-1 text-xs text-neutral-400">{m.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
