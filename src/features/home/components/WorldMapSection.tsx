/**
 * 全球商机地图区块
 * World Map Section
 *
 * @module features/home/components/WorldMapSection
 * @description 薄壳组件，通过 useHomeStats 获取国家数据并传递给 WorldMapChart，
 *              避免 WorldMapChart 内部重复请求 /api/notices/countries。
 */
import { Globe } from "lucide-react";
import { WorldMapChart } from "@/shared/ui/charts/WorldMapChart";
import { useHomeStats } from "../hooks/useHomeStats";

/** 全球商机地图区块 */
export function WorldMapSection() {
  const { countries } = useHomeStats();

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-10 bg-white border-y border-slate-100">
      <div className="max-w-[1600px] mx-auto">
        <div className="mb-6">
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Globe className="w-5 h-5 text-teal-600" />
            全球商机分布
          </h2>
        </div>
        <WorldMapChart countries={countries} />
      </div>
    </section>
  );
}
