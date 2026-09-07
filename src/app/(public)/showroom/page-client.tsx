"use client";

/**
 * 履约服务页 — 从中标到交付的全链路保障
 * Fulfillment Services Page
 *
 * @module app/(public)/showroom/page-client
 */
import {
  FileText, Truck, Shield, TrendingUp,
  ArrowRight, CheckCircle2, Globe, Building2,
} from "lucide-react";

/* ── Mock Data ── */
const STATS = [
  { label: "已服务订单", value: "2,847", sub: "累计履约" },
  { label: "覆盖国家", value: "36", sub: "全球网络" },
  { label: "合作机构", value: "128", sub: "质检/物流/金融" },
  { label: "平均履约周期", value: "45天", sub: "行业领先" },
];

const LIFECYCLE_STAGES = [
  {
    icon: FileText,
    title: "合同与合规",
    subtitle: "中标后 0-30 天",
    color: "from-blue-500 to-cyan-500",
    services: [
      { name: "合同模板下载", desc: "多语种标准合同模板" },
      { name: "合规检查清单", desc: "UNGM/海牙合规自查" },
      { name: "资质文件管理", desc: "企业资质集中管理" },
    ],
  },
  {
    icon: Truck,
    title: "交付与物流",
    subtitle: "执行期",
    color: "from-teal-500 to-emerald-500",
    services: [
      { name: "国际物流方案", desc: "海运/空运/陆运对接" },
      { name: "清关文件指导", desc: "各国清关文件准备" },
      { name: "质量检验预约", desc: "SGS/BV 第三方质检" },
    ],
  },
  {
    icon: Shield,
    title: "结算与保障",
    subtitle: "交付后",
    color: "from-amber-500 to-orange-500",
    services: [
      { name: "保函服务对接", desc: "信用证/履约保函" },
      { name: "付款进度跟踪", desc: "分阶段付款监控" },
      { name: "争议仲裁指引", desc: "国际争议解决支持" },
    ],
  },
  {
    icon: TrendingUp,
    title: "持续服务",
    subtitle: "复购周期",
    color: "from-purple-500 to-pink-500",
    services: [
      { name: "供应商绩效报告", desc: "履约表现量化评估" },
      { name: "买家满意度反馈", desc: "双向评价机制" },
      { name: "下一次采购提醒", desc: "与中标情报联动" },
    ],
  },
];

const PARTNERS = [
  { name: "SGS", type: "质量检验" },
  { name: "Bureau Veritas", type: "质量检验" },
  { name: "DHL", type: "国际物流" },
  { name: "Maersk", type: "海运物流" },
  { name: "HSBC", type: "贸易金融" },
  { name: "Standard Chartered", type: "贸易金融" },
];

export default function PageClient() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Hero Section ── */}
      <section className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-900 px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-2xl md:text-3xl font-extrabold text-white mb-2">
          履约服务
          <span className="text-teal-400 mx-3">|</span>
          <span className="text-lg md:text-xl font-bold text-slate-300">从中标到交付的全链路保障</span>
        </h1>
        <p className="text-slate-400 text-sm max-w-3xl">
          中标不是终点，而是服务的起点。我们提供合同合规、国际物流、结算保障、持续服务四大阶段的全流程支持。
        </p>
      </section>

      <div className="px-4 sm:px-6 lg:px-8 -mt-6">
        {/* ── Stats Bar ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {STATS.map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <p className="text-xl md:text-2xl font-extrabold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500 mt-1">{s.label}</p>
              <p className="text-2xs text-slate-400">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Lifecycle Stages ── */}
        <div className="space-y-6 mb-8">
          {LIFECYCLE_STAGES.map((stage, idx) => {
            const Icon = stage.icon;
            return (
              <div key={stage.title} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Stage Header */}
                <div className={`bg-gradient-to-r ${stage.color} px-6 py-4 flex items-center gap-4`}>
                  <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-extrabold text-white">{stage.title}</h2>
                      <span className="text-xs text-white/80 bg-white/20 px-2 py-0.5 rounded-full">
                        {stage.subtitle}
                      </span>
                    </div>
                    <p className="text-xs text-white/70 mt-0.5">阶段 {idx + 1} / 4</p>
                  </div>
                </div>

                {/* Services Grid */}
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {stage.services.map((svc) => (
                      <div
                        key={svc.name}
                        className="rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-teal-300 transition-all group cursor-pointer"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="text-sm font-bold text-slate-900 group-hover:text-teal-700 transition-colors">
                            {svc.name}
                          </h3>
                          <CheckCircle2 className="w-4 h-4 text-slate-300 group-hover:text-teal-500 transition-colors" />
                        </div>
                        <p className="text-xs text-slate-500 mb-3">{svc.desc}</p>
                        <button className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1">
                          了解详情 <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Partner Institutions ── */}
        <section className="mb-8">
          <div className="flex items-center justify-center gap-3 mb-6">
            <span className="w-8 h-px bg-teal-400" />
            <span className="w-2 h-2 rounded-full bg-teal-400" />
            <h2 className="text-lg font-extrabold text-slate-900">合作机构</h2>
            <span className="w-2 h-2 rounded-full bg-teal-400" />
            <span className="w-8 h-px bg-teal-400" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {PARTNERS.map((p) => (
              <div key={p.name} className="bg-white rounded-xl border border-slate-200 p-4 text-center hover:shadow-md transition-shadow">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-50 mb-2">
                  <Building2 className="w-6 h-6 text-slate-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">{p.name}</h3>
                <p className="text-2xs text-slate-500">{p.type}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA Section ── */}
        <section className="bg-gradient-to-br from-teal-600 to-teal-800 rounded-2xl p-8 text-center text-white mb-10">
          <Globe className="w-12 h-12 mx-auto mb-4 text-teal-200" />
          <h2 className="text-xl font-extrabold mb-2">需要履约服务支持？</h2>
          <p className="text-sm text-teal-100 mb-6 max-w-xl mx-auto">
            无论您处于履约的哪个阶段，我们的专业团队都能为您提供定制化解决方案
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button className="bg-white text-teal-700 px-6 py-3 rounded-xl font-bold text-sm hover:bg-teal-50 transition-colors">
              预约咨询
            </button>
            <button className="bg-teal-700 text-white border border-teal-500 px-6 py-3 rounded-xl font-bold text-sm hover:bg-teal-600 transition-colors">
              查看服务套餐
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
