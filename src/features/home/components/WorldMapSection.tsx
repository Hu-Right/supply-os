/**
 * 全球商机地图区块
 * World Map Section
 *
 * @module features/home/components/WorldMapSection
 * @description 薄壳组件，包裹 WorldMapChart 并添加标题/说明。
 */
import { Globe } from "lucide-react";
import { WorldMapChart } from "@/shared/ui/charts/WorldMapChart";

/** 全球商机地图区块 */
export function WorldMapSection() {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6">
        <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
          <Globe className="w-5 h-5 text-teal-600" />
          全球商机分布
        </h2>
        <p className="text-sm text-slate-500 mt-1">鼠标悬停查看各国未过期商机数量</p>
      </div>
      <WorldMapChart />
    </section>
  );
}
