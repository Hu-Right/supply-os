"use client";

/**
 * 履约服务页 — 从中标到交付的全链路保障
 * Fulfillment Services Page
 *
 * @module app/(public)/showroom/page-client
 */
import { useState } from "react";
import {
  FileText, Truck, Shield, TrendingUp,
  ArrowRight, CheckCircle2, Globe, Building2,
} from "lucide-react";
import { emitAppEvent } from "@/core/events";
import { ErrorBoundary, PageErrorFallback, Modal } from "@/shared/ui";

/* ══════════════════════════════════════════
   数据层
   权威数据：国际贸易行业标准 / Incoterms 2020
   规划数据：平台服务规划（标注"平台规划"）
   ═══════════════════════════════════════════ */

const STATS = [
  { label: "全球采购履约市场", value: "$1.8T", sub: "2024年国际公采总额（UN ASR）" },
  { label: "平均履约周期", value: "45-90天", sub: "中标到交付（行业基准）" },
  { label: "UN 采购合规要求", value: "12项", sub: "强制文件 + 资质审查" },
  { label: "服务网络覆盖", value: "193国", sub: "UN 成员国采购覆盖" },
];

const LIFECYCLE_STAGES = [
  {
    icon: FileText,
    title: "合同与合规",
    subtitle: "中标后 0-30 天",
    color: "from-slate-50 to-slate-100",
    services: [
      { name: "合同模板库", desc: "基于 UN General Conditions 的多语种标准合同模板，涵盖货物/工程/服务三类", detail: "提供 UN 通用合同条件（GCC）、特殊合同条件（SCC）模板，支持中/英/法/西/阿五语种。覆盖货物采购、工程承包、服务委托三大类型，所有模板均经国际商事律师审核。" },
      { name: "合规自查清单", desc: "UNGM 供应商行为准则 + 海牙认证 + 制裁筛查一站式检查", detail: "依据 UNGM Code of Conduct、UNCITRAL 采购模型法、OFAC 制裁名单，提供 32 项合规自查清单。涵盖反腐败、利益冲突、出口管制、数据保护四大维度。" },
      { name: "资质文件管理", desc: "ISO 证书 / 财务报表 / 业绩证明集中管理与有效期提醒", detail: "支持 ISO 9001/13485/14001、近三年审计报告、银行资信证明、过往业绩合同等核心资质文件的上传、分类、有效期追踪与到期提醒。" },
    ],
  },
  {
    icon: Truck,
    title: "交付与物流",
    subtitle: "执行期",
    color: "from-teal-50 to-teal-100",
    services: [
      { name: "国际物流方案", desc: "基于 Incoterms 2020 的海运/空运/陆运方案设计与承运商对接", detail: "根据货物类型、体积重量、目的地、时效要求，推荐最优 Incoterms 2020 贸易术语（FOB/CIF/DDP 等），对接 DHL、Maersk、CMA CGM 等承运商，提供门到门物流方案。" },
      { name: "清关文件指导", desc: "各国海关申报文件准备 + 原产地证 + 检验检疫证书", detail: "覆盖 193 个 UN 成员国的清关文件要求数据库，包括商业发票、装箱单、原产地证（CO/FTA）、卫生/植物检疫证书（SPS）、技术合格证明等。" },
      { name: "第三方质量检验", desc: "SGS / Bureau Veritas / Intertek 检验预约与报告管理", detail: "对接 SGS、Bureau Veritas、Intertek 三大国际检验机构，支持装船前检验（PSI）、工厂检验、实验室测试预约。检验报告直接同步至平台档案。" },
    ],
  },
  {
    icon: Shield,
    title: "结算与保障",
    subtitle: "交付后",
    color: "from-cyan-50 to-cyan-100",
    services: [
      { name: "保函与信用证", desc: "投标保函 / 履约保函 / 预付款保函 / 信用证开立指导", detail: "对接 HSBC、Standard Chartered、中国银行等贸易金融银行，提供投标保函（Bid Bond）、履约保函（Performance Bond）、预付款保函（Advance Payment Bond）、跟单信用证（L/C）的开立指导与费率对比。" },
      { name: "付款进度跟踪", desc: "里程碑付款节点监控 + 逾期预警 + 汇率风险提示", detail: "按合同里程碑（发货/到港/验收/质保）设置付款节点，自动跟踪付款进度。逾期 7 天触发预警，支持多币种汇率波动监控与锁汇建议。" },
      { name: "争议解决支持", desc: "ICC 仲裁 / UNCITRAL 调解 / 当地法律资源对接", detail: "当发生合同争议时，提供 ICC 国际仲裁、UNCITRAL 调解规则指引，对接目标国当地律所资源。平台不替代法律服务，但提供标准化争议处理流程与文档模板。" },
    ],
  },
  {
    icon: TrendingUp,
    title: "持续服务",
    subtitle: "复购周期",
    color: "from-emerald-50 to-emerald-100",
    services: [
      { name: "履约绩效报告", desc: "交付准时率 / 质量合格率 / 响应时效量化评估", detail: "基于每笔订单的交付数据，生成履约绩效报告：交付准时率（OTD）、质量合格率（First Pass Yield）、沟通响应时效、买家评分。报告可用于后续投标的业绩证明。" },
      { name: "买家评价管理", desc: "双向评价机制 + 评价回复 + 声誉分累积", detail: "履约完成后买卖双方互评，评价内容经审核后展示在供应商档案中。好评累积提升供应商声誉分，直接影响中标情报中的排名权重。" },
      { name: "下一次采购提醒", desc: "基于采购周期的智能提醒，与中标情报模块联动", detail: "根据该买家的历史采购周期（如 UNICEF 疫苗采购年均 2-3 次），在预计下次招标前 60/30/14 天推送提醒，同步关联中标情报中的该机构最新动态。" },
    ],
  },
];

/** 服务网络 — 标注为"规划对接"，避免虚假合作声明 */
const SERVICE_NETWORK = [
  { name: "SGS", type: "质量检验", country: "瑞士" },
  { name: "Bureau Veritas", type: "质量检验", country: "法国" },
  { name: "Intertek", type: "质量检验", country: "英国" },
  { name: "DHL", type: "国际物流", country: "德国" },
  { name: "Maersk", type: "海运物流", country: "丹麦" },
  { name: "HSBC", type: "贸易金融", country: "英国" },
];

/** 成功案例 — 来自 services.ts 真实数据 */
const SUCCESS_STORIES = [
  {
    date: "2026.04",
    title: "常州精密机床 · 法兰克福展厅接单",
    desc: "通过双语展厅代表接待，完成三万套零件采购订单。CRM 一键会商，从样品展示到合同签订全程平台支持。",
    tag: "展厅履约",
  },
  {
    date: "2026.03",
    title: "非洲水利滴灌系统 · 联合国援助仓交付",
    desc: "成套设备通过肯尼亚内罗毕展厅样品核验，加速通过 KEBS 国标审定，快速送达多座联合国援助仓。",
    tag: "物流清关",
  },
  {
    date: "2026.01",
    title: "山东装配公司 · 人道救灾营房项目中标",
    desc: "联合顾问在线编制英文投标书，14 天完成从资质准备到最终入选。获免税绿皮书，全量中标。",
    tag: "投标+履约",
  },
];

/* ═══════════════════════════════════════════
   弹窗组件
   ═══════════════════════════════════════════ */

/** 通用弹窗底部数据来源（分层标注） */
function DataSource({ authoritative, planning }: { authoritative: string; planning?: string }) {
  return (
    <div className="mt-4 pt-3 border-t border-slate-100 text-center space-y-0.5">
      <p className="text-2xs text-slate-400">参考标准：{authoritative}</p>
      {planning && <p className="text-2xs text-slate-300">服务内容：{planning}</p>}
    </div>
  );
}

/** 服务详情弹窗 */
function ServiceDetailModal({ open, onClose, stageTitle, service }: {
  open: boolean; onClose: () => void; stageTitle: string; service: { name: string; desc: string; detail: string } | null;
}) {
  if (!service) return null;
  return (
    <Modal open={open} onClose={onClose} title={service.name} className="max-w-lg">
      <div className="mb-3">
        <span className="text-2xs font-bold px-2 py-0.5 rounded bg-teal-50 text-teal-700">{stageTitle}</span>
      </div>
      <p className="text-sm text-slate-600 mb-4">{service.desc}</p>
      <div className="bg-slate-50 rounded-lg p-4 mb-4">
        <p className="text-xs font-bold text-slate-700 mb-2">服务说明</p>
        <p className="text-sm text-slate-600 leading-relaxed">{service.detail}</p>
      </div>
      <div className="flex gap-3 justify-end">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">关闭</button>
        <button
          onClick={() => { onClose(); emitAppEvent("supply-os:consult"); }}
          className="px-4 py-2 rounded-lg text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white transition-colors"
        >
          预约咨询
        </button>
      </div>
      <DataSource authoritative="Incoterms 2020 / UNGM / UNCITRAL" planning="平台规划服务，具体以实际开通为准" />
    </Modal>
  );
}

/* ═══════════════════════════════════════════
   Section 标题组件（统一样式）
   ═══════════════════════════════════════════ */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-3 mb-6">
      <span className="w-8 h-px bg-teal-400" />
      <span className="w-2 h-2 rounded-full bg-teal-400" />
      <h2 className="text-lg font-extrabold text-slate-900">{children}</h2>
      <span className="w-2 h-2 rounded-full bg-teal-400" />
      <span className="w-8 h-px bg-teal-400" />
    </div>
  );
}

/* ═══════════════════════════════════════════
   主页面
   ═══════════════════════════════════════════ */

export default function PageClient() {
  const [selectedService, setSelectedService] = useState<{ stage: string; svc: { name: string; desc: string; detail: string } } | null>(null);

  const handleConsult = () => emitAppEvent("supply-os:consult");

  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
    <div className="max-w-7xl mx-auto">
      {/* ── Hero Section ── */}
      <section className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-900 rounded-2xl px-6 sm:px-8 lg:px-10 py-10 mb-6">
        <h1 className="text-2xl md:text-3xl font-extrabold text-white mb-2">
          履约服务
          <span className="text-teal-400 mx-3">|</span>
          <span className="text-lg md:text-xl font-bold text-slate-300">从中标到交付的全链路保障</span>
        </h1>
        <p className="text-slate-400 text-sm max-w-3xl">
          中标不是终点，而是服务的起点。覆盖合同合规、国际物流、结算保障、持续服务四大阶段，
          基于 Incoterms 2020 与 UN 采购标准，为供应商提供全流程履约支持。
        </p>
      </section>

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
      <div className="space-y-6 mb-10">
        {LIFECYCLE_STAGES.map((stage, idx) => {
          const Icon = stage.icon;
          return (
            <div key={stage.title} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Stage Header */}
              <div className={`bg-gradient-to-r ${stage.color} px-5 sm:px-6 py-4 flex items-center gap-4`}>
                <div className="w-11 h-11 rounded-xl bg-white border border-slate-200/60 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-teal-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base sm:text-lg font-extrabold text-slate-900">{stage.title}</h2>
                    <span className="text-xs text-slate-500 bg-white/60 px-2 py-0.5 rounded-full shrink-0">{stage.subtitle}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">阶段 {idx + 1} / 4</p>
                </div>
              </div>

              {/* Services Grid */}
              <div className="p-5 sm:p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {stage.services.map((svc) => (
                    <div
                      key={svc.name}
                      className="rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-teal-300 transition-all group cursor-pointer"
                      onClick={() => setSelectedService({ stage: stage.title, svc: svc as any })}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-sm font-bold text-slate-900 group-hover:text-teal-700 transition-colors">{svc.name}</h3>
                        <CheckCircle2 className="w-4 h-4 text-slate-300 group-hover:text-teal-500 transition-colors shrink-0 ml-2" />
                      </div>
                      <p className="text-xs text-slate-500 mb-3 leading-relaxed">{svc.desc}</p>
                      <span className="text-xs font-bold text-teal-600 group-hover:text-teal-700 flex items-center gap-1">
                        了解详情 <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Success Stories ── */}
      <section className="mb-10">
        <SectionTitle>成功案例</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SUCCESS_STORIES.map((story) => (
            <div key={story.title} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xs font-bold px-2 py-0.5 rounded bg-teal-50 text-teal-700">{story.tag}</span>
                <span className="text-2xs text-slate-400">{story.date}</span>
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-2">{story.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{story.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Service Network ── */}
      <section className="mb-10">
        <SectionTitle>服务网络</SectionTitle>
        <p className="text-xs text-slate-400 text-center mb-5">以下为平台规划对接的国际服务机构（排名不分先后）</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {SERVICE_NETWORK.map((p) => (
            <div key={p.name} className="bg-white rounded-xl border border-slate-200 p-4 text-center hover:shadow-md transition-shadow">
              <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-slate-50 mb-2">
                <Building2 className="w-5 h-5 text-slate-500" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-0.5">{p.name}</h3>
              <p className="text-2xs text-teal-600 font-bold">{p.type}</p>
              <p className="text-2xs text-slate-400 mt-0.5">{p.country}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA Section ── */}
      <section className="bg-gradient-to-br from-teal-600 to-teal-800 rounded-2xl p-8 sm:p-10 text-center text-white mb-10">
        <Globe className="w-12 h-12 mx-auto mb-4 text-teal-200" />
        <h2 className="text-xl font-extrabold mb-2">需要履约服务支持？</h2>
        <p className="text-sm text-teal-100 mb-6 max-w-xl mx-auto">
          无论您处于履约的哪个阶段，我们的专业团队都能为您提供定制化解决方案
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button onClick={handleConsult} className="bg-white text-teal-700 px-6 py-3 rounded-xl font-bold text-sm hover:bg-teal-50 transition-colors">
            预约咨询
          </button>
          <button onClick={handleConsult} className="bg-teal-700 text-white border border-teal-500 px-6 py-3 rounded-xl font-bold text-sm hover:bg-teal-600 transition-colors">
            查看服务套餐
          </button>
        </div>
      </section>
    </div>

    {/* ─ 弹窗 ── */}
    <ServiceDetailModal
      open={!!selectedService}
      onClose={() => setSelectedService(null)}
      stageTitle={selectedService?.stage ?? ""}
      service={selectedService?.svc ?? null}
    />
    </ErrorBoundary>
  );
}
