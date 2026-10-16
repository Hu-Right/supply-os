/**
 * 全球商机地图区块
 * World Map Section
 *
 * @module features/home/components/WorldMapSection
 * @description 薄壳组件，通过 useHomeStats 获取国家数据并传递给 WorldMapChart，
 *              避免 WorldMapChart 内部重复请求 /api/notices/countries。
 *              支持服务端直出初值（ISR 注入，首帧即可渲染地图数据）。
 */
import { memo } from "react";
import { Globe } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { WorldMapChart } from "@/shared/ui/charts/WorldMapChart";
import { useHomeStats, type HomeStatsData } from "../hooks/useHomeStats";

/** 全球商机地图区块（initialHome 为服务端直出初值；memo 隔离父层重渲染） */
export const WorldMapSection = memo(function WorldMapSection({ initialHome }: { initialHome?: Partial<HomeStatsData> } = {}) {
  const { t } = useLocale();
  const { countries } = useHomeStats(initialHome);

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-10">
      <div className="max-w-[1600px] mx-auto">
        <div className="mb-6">
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Globe className="w-5 h-5 text-teal-600" />
            {t("homeWorldMapTitle")}
          </h2>
        </div>
        <WorldMapChart countries={countries} />
      </div>
    </section>
  );
});
