/**
 * 投标服务市场 — 核心内容模块
 * Core Content Modules — 6 module items
 *
 * @module features/services/components/CoreModules
 */

import { GitBranch, ListChecks, FileText, FileSearch, Crown, Star } from "lucide-react";

const MODULES = [
  {
    icon: GitBranch,
    title: "生命周期分组",
    desc: "按投标前/中/后组织服务，场景清晰",
  },
  {
    icon: ListChecks,
    title: "服务卡标准字段",
    desc: "适用对象/价值/交付物/报价方式/时效",
  },
  {
    icon: FileText,
    title: "服务详情页",
    desc: "服务介绍/流程/交付物/案例/FAQ/顾问",
  },
  {
    icon: FileSearch,
    title: "招标详情页预填咨询",
    desc: "基于项目信息一键生成咨询单",
  },
  {
    icon: Crown,
    title: "年度顾问包",
    desc: "高频服务打包锁定年费客户",
  },
  {
    icon: Star,
    title: "案例证明",
    desc: "成功案例/客户评价增强信任促进成交",
  },
];

export function CoreModules() {
  return (
    <section className="py-8">
      {/* 标题 */}
      <div className="flex items-center justify-center gap-3 mb-8">
        <div className="h-px w-12 bg-gradient-to-r from-transparent to-teal-400" />
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
          <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
        </div>
        <h2 className="text-xl md:text-2xl font-extrabold text-slate-900">
          核心内容模块
        </h2>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
          <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
        </div>
        <div className="h-px w-12 bg-gradient-to-l from-transparent to-teal-400" />
      </div>

      {/* 6个模块 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {MODULES.map((mod) => {
          const Icon = mod.icon;
          return (
            <div
              key={mod.title}
              className="bg-white rounded-xl border border-slate-200 p-4 text-center hover:shadow-md transition-shadow"
            >
              <div className="w-12 h-12 mx-auto rounded-xl bg-slate-50 flex items-center justify-center mb-3">
                <Icon className="w-6 h-6 text-slate-700" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 mb-1.5">
                {mod.title}
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                {mod.desc}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

CoreModules.displayName = "CoreModules";
