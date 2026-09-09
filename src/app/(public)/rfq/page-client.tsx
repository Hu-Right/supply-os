"use client";

/**
 * RFQ 采购方发布需求页 — 模块13 设计图100%还原
 * RFQ Page — Module 13 Design Mockup 100% Restore
 *
 * @module app/(public)/rfq/page-client
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Send, Calendar, Upload, Radio, User, Mail, Phone,
  Bot, Users, UserCheck, Bell,
  FileText, Share2, FileCheck, Lock,
  Zap, Target, MessageCircle, Headphones,
  Gem, Plane, Zap as LightningIcon, Crown, Shield,
  ChevronRight, Globe, Crosshair, AlertTriangle,
} from "lucide-react";
import { useLocale } from "@/core/i18n";
import { ErrorBoundary, PageErrorFallback } from "@/shared/ui";

/* ── 最新RFQ Mock 数据 ── */
const LATEST_RFQS = [
  { tag: "能源/光伏", tagColor: "bg-amber-50 text-amber-700 border-amber-200", title: "光伏组件采购", country: "德国", budget: "10MW", deadline: "2024-06-05", responses: 12 },
  { tag: "医疗/设备", tagColor: "bg-blue-50 text-blue-700 border-blue-200", title: "医疗设备询价", country: "沙特阿拉伯", budget: "USD 500,000", deadline: "2024-06-03", responses: 18 },
  { tag: "机械/工程", tagColor: "bg-slate-100 text-slate-700 border-slate-200", title: "工程机械需求", country: "肯尼亚", budget: "USD 300,000", deadline: "2024-06-08", responses: 9 },
  { tag: "化工/原料", tagColor: "bg-teal-50 text-teal-700 border-teal-200", title: "化工原料采购", country: "印度尼西亚", budget: "100 吨", deadline: "2024-06-06", responses: 15 },
];

/* ── 平台服务辅助 ── */
const PLATFORM_SERVICES = [
  { icon: Bot, title: "AI推荐供应商", desc: "基于大数据与AI算法，智能推荐匹配度最高的优质供应商。" },
  { icon: User, title: "顾问协助梳理需求", desc: "专业采购顾问1对1支持，帮助优化需求，明确采购要点。" },
  { icon: UserCheck, title: "定向邀请认证供应商", desc: "可指定行业/地区/认证的优质供应商，定向邀请报价。" },
  { icon: Bell, title: "报价管理与提醒", desc: "集中管理供应商报价，实时提醒截止时间与报价更新。" },
];

/* ── 供应商响应流程 ── */
const RESPONSE_FLOW = [
  { icon: FileText, title: "采购方发布", desc: "采购方发布 RFQ 明确需求与截止时间" },
  { icon: Share2, title: "平台匹配", desc: "平台智能匹配供应商 定向邀约或公开询价" },
  { icon: FileCheck, title: "供应商报价", desc: "供应商在线报价 提交方案与资质文件" },
  { icon: Lock, title: "线下履约 / 顾问跟进", desc: "平台顾问跟进支持 推动合同与履约落地" },
];

/* ── RFQ价值 ── */
const RFQ_VALUES = [
  { icon: Zap, title: "快速比价", desc: "多家报价一目了然 快速对比更高效" },
  { icon: Target, title: "定向匹配", desc: "精准匹配优质供应商 提高匹配成功率" },
  { icon: MessageCircle, title: "降低沟通成本", desc: "一站式发布与管理 减少重复沟通成本" },
  { icon: Headphones, title: "获得专业支持", desc: "专业顾问全程协助 提升采购成功率" },
];

/* ── 核心内容模块 ── */
const CORE_MODULES = [
  { icon: FileText, title: "发布表单", desc: "结构化表单，多样字段 支持附件与公开/定向设置" },
  { icon: ListIcon, title: "最新RFQ列表", desc: "实时展示全球采购需求 支持筛选与关键词搜索" },
  { icon: Crosshair, title: "定向邀约", desc: "按行业/地区/认证 定向邀请优质供应商" },
  { icon: Users, title: "供应商推荐", desc: "AI与人工结合推荐 匹配度更高的供应商" },
  { icon: FileCheck, title: "报价管理", desc: "集中管理报价与沟通 提醒与进度跟踪" },
  { icon: Shield, title: "履约支持", desc: "顾问跟进，合同协助 推动履约与售后支持" },
];

function ListIcon(props: React.SVGProps<SVGSVGElement> & { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

/* ── 变现动作 ── */
const MONETIZATION = [
  { icon: Gem, title: "发布增值包", desc: "高级展示/置顶曝光/优先推荐" },
  { icon: Plane, title: "定向邀约服务", desc: "付费定向邀约更多认证供应商" },
  { icon: LightningIcon, title: "加急匹配", desc: "加急匹配通道 提升响应速度" },
  { icon: User, title: "采购顾问", desc: "一对一顾问服务与 梳理需求与谈判支持" },
  { icon: Crown, title: "供应商会员响应权限", desc: "供应商会员获得更多 报价次数与优先响应权" },
  { icon: Shield, title: "履约服务", desc: "验货、物流、支付结算 等增值服务收费" },
];

export default function PageClient() {
  const { t } = useLocale();
  const router = useRouter();
  const [formData, setFormData] = useState({
    title: "", category: "", quantity: "", country: "", deadline: "",
    isPublic: true, contactName: "", contactInfo: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setFormData({ title: "", category: "", quantity: "", country: "", deadline: "", isPublic: true, contactName: "", contactInfo: "" });
    }, 3000);
  };

  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
    <div className="space-y-6">
      {/* ═══════════════════════════════════════════
          1. 深色 Hero 页头
         ═══════════════════════════════════════════ */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0a1628] via-[#0f2035] to-[#0d2847] px-6 sm:px-8 py-10 md:py-14">
        {/* 右侧地球装饰 */}
        <div className="absolute right-0 top-0 w-[45%] h-full opacity-15 pointer-events-none">
          <div className="absolute right-[-10%] top-[-20%] w-[80%] h-[140%] rounded-full border border-teal-500/20" />
          <div className="absolute right-[-5%] top-[-10%] w-[60%] h-[120%] rounded-full border border-teal-400/10" />
          <div className="absolute right-[5%] top-[10%] w-[40%] h-[80%] rounded-full bg-gradient-to-br from-teal-500/10 to-transparent" />
        </div>

        <div className="relative z-10">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-white tracking-tight">
            采购方发布需求 / RFQ
          </h1>
          <p className="text-slate-400 text-sm md:text-base mt-3 max-w-2xl leading-relaxed">
            一键发布采购需求，快速获取优质供应商报价与平台顾问支持。
          </p>

          {/* CTA 按钮 */}
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => document.getElementById("rfq-form")?.scrollIntoView({ behavior: "smooth" })}
              className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-6 py-2.5 rounded-lg text-sm font-bold transition-colors"
            >
              <Send className="w-4 h-4" /> 立即发布需求
            </button>
            <button
              onClick={() => {}}
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 px-6 py-2.5 rounded-lg text-sm font-bold transition-colors"
            >
              预约采购顾问
            </button>
          </div>

          {/* 特性标签 */}
          <div className="mt-5 flex flex-wrap gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-teal-400" /> 公开询价</span>
            <span className="flex items-center gap-1.5"><Crosshair className="w-3.5 h-3.5 text-blue-400" /> 定向邀约</span>
            <span className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> 紧急采购</span>
            <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-purple-400" /> 多语言支持</span>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          2. 表单 + 平台服务（双栏）
         ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── 左：发布需求表单 ── */}
        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs" id="rfq-form">
            {submitted ? (
              <div className="text-center py-16">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-teal-100 mb-5">
                  <Send className="w-10 h-10 text-teal-600" />
                </div>
                <h3 className="text-xl font-extrabold text-slate-900 mb-2">RFQ 已发布</h3>
                <p className="text-sm text-slate-500">平台将智能匹配供应商，您将在 24 小时内收到报价。</p>
              </div>
            ) : (
              <>
                <h2 className="text-lg font-extrabold text-slate-900 mb-5">发布需求表单</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* 需求标题 */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">需求标题 *</label>
                    <input required value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-400 outline-none" placeholder="请输入需求标题" />
                  </div>
                  {/* 产品/服务分类 */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">产品/服务分类 *</label>
                    <select required value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-400 outline-none bg-white">
                      <option value="">请选择产品/服务分类</option>
                      <option>医疗耗材</option><option>新能源</option><option>工程机械</option>
                      <option>教育/IT</option><option>农业</option><option>化工原料</option><option>其他</option>
                    </select>
                  </div>
                  {/* 数量/规格 */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">数量/规格 *</label>
                    <input required value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-400 outline-none" placeholder="如：5000件 / 功率550W / 尺寸定制等" />
                  </div>
                  {/* 目标国家 */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">目标国家 *</label>
                    <select required value={formData.country} onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-400 outline-none bg-white">
                      <option value="">请选择目标国家/地区</option>
                      <option>德国</option><option>沙特阿拉伯</option><option>肯尼亚</option>
                      <option>印度尼西亚</option><option>尼日利亚</option><option>其他</option>
                    </select>
                  </div>
                  {/* 截止时间 */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">截止时间 *</label>
                    <input required type="date" value={formData.deadline} onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-400 outline-none" />
                  </div>
                  {/* 附件上传 */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">附件上传</label>
                    <div className="flex items-center justify-between rounded-lg border border-dashed border-slate-300 px-3.5 py-3">
                      <span className="text-xs text-slate-500">支持 PDF / Word / Excel / 图片，单个文件不超过 20MB</span>
                      <button type="button" className="shrink-0 ml-3 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50">
                        <Upload className="w-3.5 h-3.5 inline mr-1" />上传文件
                      </button>
                    </div>
                  </div>
                  {/* 是否公开 */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2">是否公开 *</label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="isPublic" checked={formData.isPublic} onChange={() => setFormData({ ...formData, isPublic: true })} className="accent-teal-600" />
                        <span className="text-sm text-slate-700"><strong>公开询价</strong> <span className="text-xs text-slate-400">（所有认证供应商可见）</span></span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="isPublic" checked={!formData.isPublic} onChange={() => setFormData({ ...formData, isPublic: false })} className="accent-teal-600" />
                        <span className="text-sm text-slate-700"><strong>定向邀约</strong> <span className="text-xs text-slate-400">（仅受邀供应商可见）</span></span>
                      </label>
                    </div>
                  </div>
                  {/* 联系方式 */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">联系方式 *</label>
                    <div className="grid grid-cols-2 gap-3">
                      <input required value={formData.contactName} onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                        className="rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-400 outline-none" placeholder="姓名" />
                      <input required value={formData.contactInfo} onChange={(e) => setFormData({ ...formData, contactInfo: e.target.value })}
                        className="rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-400 outline-none" placeholder="邮箱 / 手机号" />
                    </div>
                  </div>
                  {/* 提交 */}
                  <button type="submit" className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold transition-colors shadow-sm">
                    发布RFQ
                  </button>
                  <p className="text-center text-2xs text-slate-400 flex items-center justify-center gap-1">
                    <Lock className="w-3 h-3" /> 您的信息将严格保密，仅用于需求匹配与服务
                  </p>
                </form>
              </>
            )}
          </div>
        </div>

        {/* ── 右：平台服务 + 最新RFQ ── */}
        <div className="lg:col-span-7 space-y-6">
          {/* 平台服务辅助 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <h2 className="text-lg font-extrabold text-slate-900 mb-4">平台服务辅助</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {PLATFORM_SERVICES.map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.title} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                    <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-teal-600" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 mb-0.5">{s.title}</h4>
                      <p className="text-xs text-slate-500 leading-relaxed">{s.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 最新RFQ需求 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold text-slate-900">最新RFQ需求</h2>
              <button className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-0.5">
                更多 <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {LATEST_RFQS.map((rfq) => (
                <div key={rfq.title} className="rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
                  <span className={`inline-block px-2 py-0.5 rounded border text-2xs font-bold mb-2 ${rfq.tagColor}`}>{rfq.tag}</span>
                  <h4 className="text-sm font-bold text-slate-900 mb-2">{rfq.title}</h4>
                  <div className="space-y-1 text-xs text-slate-500">
                    <p>国家/地区：{rfq.country}</p>
                    <p>数量/预算：{rfq.budget}</p>
                    <p>截止时间：{rfq.deadline}</p>
                    <p className="text-teal-600 font-bold">已有 {rfq.responses} 家响应</p>
                  </div>
                  <button className="mt-3 w-full py-1.5 rounded-lg border border-teal-200 text-xs font-bold text-teal-700 hover:bg-teal-50 transition-colors">
                    查看详情
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          3. 供应商响应流程 + RFQ价值
         ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 供应商响应流程 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <h2 className="text-lg font-extrabold text-slate-900 mb-5">供应商响应流程</h2>
          <div className="flex items-start gap-2 overflow-x-auto pb-2">
            {RESPONSE_FLOW.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="flex items-start gap-2 min-w-0">
                  <div className="flex flex-col items-center text-center min-w-[80px]">
                    <div className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center mb-2">
                      <Icon className="w-5 h-5 text-teal-600" />
                    </div>
                    <h4 className="text-xs font-bold text-slate-800 mb-0.5">{step.title}</h4>
                    <p className="text-2xs text-slate-500 leading-relaxed">{step.desc}</p>
                  </div>
                  {idx < RESPONSE_FLOW.length - 1 && (
                    <div className="flex items-center pt-5 text-slate-300 shrink-0">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* RFQ价值 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <h2 className="text-lg font-extrabold text-slate-900 mb-5">RFQ价值（为什么采购方愿意用）</h2>
          <div className="grid grid-cols-2 gap-4">
            {RFQ_VALUES.map((v) => {
              const Icon = v.icon;
              return (
                <div key={v.title} className="text-center p-3">
                  <div className="w-12 h-12 mx-auto rounded-full bg-slate-50 flex items-center justify-center mb-2">
                    <Icon className="w-5 h-5 text-slate-700" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 mb-1">{v.title}</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">{v.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          4. 核心内容模块
         ═══════════════════════════════════════════ */}
      <section className="py-4">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="h-px w-12 bg-gradient-to-r from-transparent to-teal-400" />
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
            <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
          </div>
          <h2 className="text-xl md:text-2xl font-extrabold text-slate-900">核心内容模块</h2>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
            <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
          </div>
          <div className="h-px w-12 bg-gradient-to-l from-transparent to-teal-400" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {CORE_MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <div key={mod.title} className="bg-white rounded-xl border border-slate-200 p-4 text-center hover:shadow-md transition-shadow">
                <div className="w-12 h-12 mx-auto rounded-xl bg-slate-50 flex items-center justify-center mb-3">
                  <Icon className="w-6 h-6 text-slate-700" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 mb-1.5">{mod.title}</h4>
                <p className="text-xs text-slate-500 leading-relaxed">{mod.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          5. 变现动作
         ═══════════════════════════════════════════ */}
      <section className="py-4">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="h-px w-12 bg-gradient-to-r from-transparent to-teal-400" />
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
            <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
          </div>
          <h2 className="text-xl md:text-2xl font-extrabold text-slate-900">变现动作</h2>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
            <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
          </div>
          <div className="h-px w-12 bg-gradient-to-l from-transparent to-teal-400" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {MONETIZATION.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="bg-white rounded-xl border border-slate-200 p-4 text-center hover:shadow-md transition-shadow">
                <div className="w-12 h-12 mx-auto rounded-xl bg-slate-50 flex items-center justify-center mb-3">
                  <Icon className="w-6 h-6 text-slate-700" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 mb-1.5">{item.title}</h4>
                <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          6. 底部价值卡片
         ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {[
          { title: "RFQ是平台最直接的撮合入口", desc: "采购方主动发需求，带来高转化线索，\n让供需双方在平台高效连接。" },
          { title: "有需求的一方能带动供应商活跃与付费", desc: "真实采购需求驱动供应商活跃报价，会员与增\n值服务成为平台持续收入来源。" },
          { title: "采购发布 + 供应商响应 + 顾问服务\n能形成闭环变现", desc: "线索 → 匹配 → 报价 → 履约，平台多角色参与，\n实现多维度、多层次的商业价值闭环。" },
        ].map((card) => (
          <div key={card.title} className="rounded-2xl bg-gradient-to-br from-[#0a1628] via-[#0f2035] to-[#0d2847] p-6">
            <h4 className="text-base font-bold text-white mb-2 leading-snug">{card.title}</h4>
            <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-line">{card.desc}</p>
          </div>
        ))}
      </div>
    </div>
    </ErrorBoundary>
  );
}
