/**
 * 首页核心内容模块 — 100% 还原设计图
 * Core Content Modules — 6 Cards
 *
 * @module features/home/components/ProductPath
 * @description 展示首页6大核心内容模块：双搜索入口、实时规模数字墙、
 *              今日热门商机、热门国家/行业/UNSPSC、认证供应商与RFQ、会员升级与服务转化。
 */
import { Search, BarChart3, Flame, Globe, ShieldCheck, Crown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface CoreModule {
  icon: LucideIcon;
  title: string;
  desc: string;
  color: string;
}

const modules: CoreModule[] = [
  {
    icon: Search,
    title: "双搜索入口",
    desc: "采购机会 + 供应商双入口直达核心需求",
    color: "text-teal-600",
  },
  {
    icon: BarChart3,
    title: "实时规模数字墙",
    desc: "用数据建立平台可信度强化规模感与实时性",
    color: "text-blue-600",
  },
  {
    icon: Flame,
    title: "今日热门商机",
    desc: "聚合高热度、临近截止的优质商机，提升点击",
    color: "text-rose-600",
  },
  {
    icon: Globe,
    title: "热门国家/行业/UNSPSC",
    desc: "多维度快速发现机会拓展用户搜索边界",
    color: "text-purple-600",
  },
  {
    icon: ShieldCheck,
    title: "认证供应商与RFQ",
    desc: "推荐优质供应商与采购方需求，促进撮合",
    color: "text-emerald-600",
  },
  {
    icon: Crown,
    title: "会员升级与服务转化",
    desc: "清晰展示会员价值与服务引导转化与变现",
    color: "text-amber-600",
  },
];

/** 首页核心内容模块 — 6 卡片 */
export function ProductPath() {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-10 bg-white border-t border-slate-100">
      <div className="mb-8 text-center">
        <h2 className="text-xl font-extrabold text-slate-900">首页核心内容模块</h2>
        <div className="flex items-center justify-center gap-2 mt-2">
          <span className="w-8 h-px bg-teal-500" />
          <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
          <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
          <span className="w-8 h-px bg-teal-500" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5 max-w-6xl mx-auto">
        {modules.map((mod) => {
          const Icon = mod.icon;
          return (
            <div key={mod.title} className="bg-slate-50 hover:bg-white rounded-2xl border border-slate-200 hover:border-teal-200 p-5 text-center transition-all hover:shadow-md group">
              <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full bg-white border border-slate-100 mb-3 group-hover:scale-110 transition-transform`}>
                <Icon className={`w-6 h-6 ${mod.color}`} />
              </div>
              <h3 className="text-sm font-extrabold text-slate-900 mb-1">{mod.title}</h3>
              <p className="text-2xs text-slate-500 leading-relaxed">{mod.desc}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
