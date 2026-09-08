/**
 * 平台介绍 — 核心优势区块
 * About Advantages — 4 core value propositions
 *
 * @module features/home/components/about/AboutAdvantages
 * @description 四列优势卡片：全球覆盖 / AI 匹配 / 投标支持 / 履约保障。
 */
import { Globe, Zap, Users, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ADVANTAGES: { icon: LucideIcon; title: string; desc: string; color: string }[] = [
  {
    icon: Globe,
    title: "全球覆盖",
    desc: "聚合联合国、世界银行及多国政府采购数据，一站式触达全球公共采购机会",
    color: "bg-teal-50 text-teal-600",
  },
  {
    icon: Zap,
    title: "AI 智能匹配",
    desc: "基于行业、资质、历史中标数据，精准推荐最契合的商机",
    color: "bg-blue-50 text-blue-600",
  },
  {
    icon: Users,
    title: "专业投标支持",
    desc: "从标书制作、资质准备到多语言翻译，专业团队全程辅助",
    color: "bg-violet-50 text-violet-600",
  },
  {
    icon: TrendingUp,
    title: "全链路履约保障",
    desc: "合同管理、国际物流、跨境结算、合规风控，覆盖完整闭环",
    color: "bg-emerald-50 text-emerald-600",
  },
];

export function AboutAdvantages() {
  return (
    <div className="bg-neutral-50/60 border-y border-neutral-100">
      <div className="max-w-5xl mx-auto px-6 sm:px-8 lg:px-8 py-20 md:py-24">
        <div className="text-center mb-14">
          <h3 className="text-2xl md:text-3xl font-semibold text-neutral-900 tracking-tight">
            为什么选择云境
          </h3>
          <p className="mt-4 text-base text-neutral-500 max-w-xl mx-auto">
            从商机发现到合同履约，提供全链路数字化服务
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-10">
          {ADVANTAGES.map((a) => {
            const Icon = a.icon;
            return (
              <div key={a.title} className="group">
                <div className={`w-11 h-11 rounded-xl ${a.color} flex items-center justify-center mb-5`}>
                  <Icon className="w-5 h-5" strokeWidth={1.5} />
                </div>
                <h4 className="text-base font-semibold text-neutral-900 mb-2">{a.title}</h4>
                <p className="text-sm text-neutral-500 leading-relaxed">{a.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
