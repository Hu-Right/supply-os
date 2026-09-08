/**
 * 平台介绍模块 — 真实数据背书 + 极简美学
 * About Section — Real Data + Minimalist Design
 *
 * @module features/home/components/AboutSection
 * @description 消费 useHomeStats 统一数据源（采购公告数、覆盖国家数、认证供应商数），
 *              采用苹果级极简设计：大量留白、精致排版、微妙动效。
 */
import { useRouter } from "next/navigation";
import {
  Search,
  Sparkles,
  FileCheck,
  ShieldCheck,
  Globe,
  Zap,
  Users,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatCompactNumber } from "@/shared/utils/format";
import { useHomeStats } from "../hooks/useHomeStats";

/* ── 四步路径 ── */
const STEPS = [
  {
    icon: Search,
    title: "搜索",
    desc: "全球采购公告实时检索",
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

/* ── 核心优势 ── */
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

export function AboutSection() {
  const router = useRouter();
  const { noticeActive, countryCount, certifiedSupplierCount } = useHomeStats();

  const metrics = [
    { value: formatCompactNumber(noticeActive), label: "实时采购公告", sub: "每日持续更新" },
    { value: `${countryCount}+`, label: "覆盖国家/地区", sub: "联合国 & 国际组织" },
    { value: formatCompactNumber(certifiedSupplierCount), label: "认证供应商", sub: "企业资质已核验" },
    { value: "13.5万亿$", label: "全球采购规模", sub: "2026 年全球统计" },
  ];

  return (
    <section className="bg-white">
      {/* ── Hero 区 ── */}
      <div className="max-w-5xl mx-auto px-6 sm:px-8 lg:px-8 pt-20 pb-12 md:pt-28 md:pb-16 text-center">
        <p className="text-5xl font-semibold text-teal-600 tracking-widest uppercase mb-5">
          云境·国际采购平台
        </p>
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-neutral-900 tracking-tight leading-tight">
          连接中国供应商
          <br className="hidden sm:block" />
          <span className="text-teal-600"> 与全球公共采购市场</span>
        </h2>
        <p className="mt-6 text-base md:text-lg text-neutral-500 max-w-2xl mx-auto leading-relaxed">
          聚合联合国、世界银行及多国政府采购数据，AI 智能匹配 + 专业投标支持，
          助力中国企业高效出海
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

      {/* ── 核心优势（彩色图标，区块对比） ── */}
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

      {/* ── 四步路径（白底 + 彩色步骤图标） ── */}
      <div className="bg-white">
        <div className="max-w-4xl mx-auto px-6 sm:px-8 lg:px-8 py-20 md:py-24">
          <div className="text-center mb-14">
            <h3 className="text-2xl md:text-3xl font-semibold text-neutral-900 tracking-tight">
              四步完成全球投标
            </h3>
            <p className="mt-4 text-base text-neutral-500">全流程数字化，每一步都有专业支撑</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="relative flex flex-col items-center text-center">
                  {idx < STEPS.length - 1 && (
                    <div className="hidden md:block absolute top-5 left-[55%] w-[90%] h-px bg-neutral-200" />
                  )}
                  <div className={`w-11 h-11 rounded-xl ${step.color} flex items-center justify-center mb-4`}>
                    <Icon className="w-5 h-5" strokeWidth={1.5} />
                  </div>
                  <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">
                    Step {idx + 1}
                  </span>
                  <h4 className="text-sm font-semibold text-neutral-900">{step.title}</h4>
                  <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed">{step.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── CTA（品牌色强调） ── */}
      <div className="bg-neutral-50/60 border-t border-neutral-100">
        <div className="max-w-3xl mx-auto px-6 sm:px-8 lg:px-8 py-20 md:py-24 text-center">
          <h3 className="text-2xl md:text-3xl font-semibold text-neutral-900 tracking-tight">
            准备好开启全球采购之旅？
          </h3>
          <p className="mt-4 text-base text-neutral-500">
            立即搜索实时商机，或注册成为认证供应商
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => router.push("/procurement")}
              className="inline-flex items-center gap-2 rounded-full bg-teal-600 px-8 py-3 text-sm font-semibold text-white hover:bg-teal-700 transition-colors shadow-sm"
            >
              搜索商机
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => router.push("/suppliers/register")}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-8 py-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              免费注册
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
