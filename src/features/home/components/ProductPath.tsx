/**
 * 产品路径 — 从找标到中标 4 步
 * Product Path — 4 Steps from Discovery to Delivery
 *
 * @module features/home/components/ProductPath
 * @description 展示平台核心价值链：发现机会 → AI 评估 → 投标服务 → 履约保障。
 *              每步可点击跳转对应功能页。
 */
import { Search, Sparkles, FileText, Award } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface PathStep {
  icon: LucideIcon;
  title: string;
  desc: string;
  href: string;
  color: string;
}

const steps: PathStep[] = [
  {
    icon: Search,
    title: "发现机会",
    desc: "全球采购机会智能检索",
    href: "/procurement",
    color: "from-teal-500 to-teal-600",
  },
  {
    icon: Sparkles,
    title: "AI 评估",
    desc: "智能拆标与投标可行性分析",
    href: "/procurement",
    color: "from-blue-500 to-blue-600",
  },
  {
    icon: FileText,
    title: "投标服务",
    desc: "标书准备与提交辅助",
    href: "/services",
    color: "from-purple-500 to-purple-600",
  },
  {
    icon: Award,
    title: "履约保障",
    desc: "中标后谈判与履约支持",
    href: "/showroom",
    color: "from-amber-500 to-amber-600",
  },
];

/** 产品路径 — 4 步从找标到中标 */
export function ProductPath() {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-10 bg-white border-t border-slate-100">
      <div className="mb-8 text-center">
        <h2 className="text-xl font-extrabold text-slate-900">从找标到中标，只需 4 步</h2>
        <p className="text-sm text-slate-500 mt-1">全链路采购机会服务平台</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
        {steps.map((step, idx) => (
          <a
            key={step.title}
            href={step.href}
            className="group relative bg-slate-50 hover:bg-white rounded-2xl border border-slate-200 hover:border-teal-300 p-6 text-center transition-all hover:shadow-md"
          >
            {/* 步骤编号 */}
            <span className="absolute top-3 right-3 text-2xs font-bold text-slate-300">
              0{idx + 1}
            </span>
            {/* 图标 */}
            <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${step.color} mb-4 group-hover:scale-110 transition-transform`}>
              <step.icon className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-sm font-extrabold text-slate-900 mb-1">{step.title}</h3>
            <p className="text-xs text-slate-500">{step.desc}</p>
            {/* 连接线（桌面端，最后一步不画） */}
            {idx < steps.length - 1 && (
              <div className="hidden lg:block absolute top-1/2 -right-3 w-6 h-px bg-slate-300" />
            )}
          </a>
        ))}
      </div>
    </section>
  );
}
