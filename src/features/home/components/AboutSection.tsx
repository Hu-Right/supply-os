/**
 * 平台介绍模块 — 定位 + 四步路径
 * About Section — Platform Positioning + 4-Step Journey
 *
 * @module features/home/components/AboutSection
 * @description 组合方案 A（平台定位）+ C（四步路径），
 *              在用户浏览完数据后形成整体认知，引导行动。
 */
import { useRouter } from "next/navigation";
import { Search, Sparkles, FileCheck, ShieldCheck } from "lucide-react";

const STEPS = [
  {
    icon: Search,
    title: "搜索",
    desc: "10 万+ 全球采购公告实时检索",
    color: "bg-teal-50 text-teal-600",
  },
  {
    icon: Sparkles,
    title: "匹配",
    desc: "AI 智能推荐契合商机",
    color: "bg-blue-50 text-blue-600",
  },
  {
    icon: FileCheck,
    title: "投标",
    desc: "专业团队辅助标书制作",
    color: "bg-amber-50 text-amber-600",
  },
  {
    icon: ShieldCheck,
    title: "履约",
    desc: "合同、物流、结算全程保障",
    color: "bg-emerald-50 text-emerald-600",
  },
];

export function AboutSection() {
  const router = useRouter();

  return (
    <section className="bg-white py-16 px-4">
      <div className="max-w-4xl mx-auto text-center">
        {/* 定位标题 */}
        <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900">
          连接中国供应商与全球公共采购市场
        </h2>
        <p className="mt-3 text-slate-500 text-sm md:text-base max-w-2xl mx-auto">
          聚合联合国、世界银行及 190+ 国家政府采购数据，10 万+ 实时商机，一站式触达
        </p>

        {/* 四步路径 */}
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-6">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="relative flex flex-col items-center">
                {/* 连接线（除最后一个） */}
                {idx < STEPS.length - 1 && (
                  <div className="hidden md:block absolute top-6 left-[60%] w-[80%] h-px bg-slate-200" />
                )}
                <div className={`w-12 h-12 rounded-xl ${step.color} flex items-center justify-center mb-3`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-xs text-slate-400 mb-1">步骤 {idx + 1}</span>
                <h3 className="text-sm font-bold text-slate-900">{step.title}</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{step.desc}</p>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <button
          onClick={() => router.push("/procurement")}
          className="mt-10 inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-8 py-3 rounded-lg text-sm font-bold transition-colors"
        >
          立即搜索商机
          <span aria-hidden>→</span>
        </button>
      </div>
    </section>
  );
}
