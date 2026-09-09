"use client";

/**
 * RFQ 采购需求发布页
 * RFQ Publish Page
 *
 * @module app/(public)/rfq/page-client
 * @description 发布表单为主体 + 已发布需求列表。
 *              采购方填写表单提交需求，平台审核后上线展示。
 */
import { useState } from "react";
import { Send, Shield, Clock, Building2, CheckCircle2 } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { ErrorBoundary, PageErrorFallback } from "@/shared/ui";

/* ── Mock RFQ 数据 ── */
interface RfqItem {
  id: number;
  title: string;
  buyer: string;
  country: string;
  budget: string;
  deadline: string;
  daysLeft: number;
  category: string;
  responses: number;
  status: "open" | "closing" | "closed";
}

const MOCK_RFQS: RfqItem[] = [
  { id: 1, title: "医疗防护设备批量采购", buyer: "某国际卫生组织", country: "肯尼亚", budget: "USD 500,000", deadline: "2026-10-15", daysLeft: 38, category: "医疗耗材", responses: 12, status: "open" },
  { id: 2, title: "太阳能光伏组件供应", buyer: "某非洲能源署", country: "尼日利亚", budget: "USD 2,000,000", deadline: "2026-09-20", daysLeft: 13, category: "新能源", responses: 8, status: "closing" },
  { id: 3, title: "教育设备与IT基础设施", buyer: "某联合国教科文项目", country: "加纳", budget: "USD 350,000", deadline: "2026-11-01", daysLeft: 55, category: "教育/IT", responses: 5, status: "open" },
  { id: 4, title: "农业灌溉系统成套设备", buyer: "某世界银行援助项目", country: "埃塞俄比亚", budget: "USD 1,200,000", deadline: "2026-09-10", daysLeft: 3, category: "农业", responses: 15, status: "closing" },
];

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  open: { bg: "bg-teal-50 border-teal-200", text: "text-teal-700", label: "征集中" },
  closing: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", label: "即将截止" },
  closed: { bg: "bg-slate-50 border-slate-200", text: "text-slate-500", label: "已截止" },
};

export default function PageClient() {
  const { t } = useLocale();
  const [rfqs] = useState<RfqItem[]>(MOCK_RFQS);
  const [formData, setFormData] = useState({ title: "", category: "", budget: "", deadline: "", description: "", company: "", contact: "" });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setFormData({ title: "", category: "", budget: "", deadline: "", description: "", company: "", contact: "" });
    }, 4000);
  };

  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
    <div className="space-y-6">
      {/* ══ 深色页头 ═══ */}
      <section className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-900 rounded-2xl px-5 sm:px-6 py-8">
        <h1 className="text-2xl md:text-3xl font-extrabold text-white">
          发布采购需求
          <span className="text-base font-bold text-slate-300 ml-2">|</span>
          <span className="text-base font-bold text-slate-300 ml-2">采购方发布 · 供应商响应 · 平台撮合</span>
        </h1>
        <p className="text-slate-400 text-sm mt-2 max-w-3xl">
          填写下方表单发布您的采购需求，平台审核通过后自动上线，优质供应商将主动报价。
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5 text-teal-400" /> 需求核验</span>
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-amber-400" /> 过期自动下线</span>
          <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5 text-blue-400" /> 联系方式保护</span>
        </div>
      </section>

      {/* ══ 发布表单 ═══ */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        {submitted ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-teal-100 mb-5">
              <CheckCircle2 className="w-10 h-10 text-teal-600" />
            </div>
            <h3 className="text-xl font-extrabold text-slate-900 mb-2">需求已提交审核</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              平台将在 1-2 个工作日内完成企业资质核验，通过后您的采购需求将自动上线展示。
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
                <Send className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">填写采购需求</h2>
                <p className="text-xs text-slate-500">带 * 为必填项，信息越详细越容易获得优质报价</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* 需求标题 + 品类 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">需求标题 *</label>
                  <input
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-400 focus:ring-1 focus:ring-teal-400 outline-none transition-colors"
                    placeholder="如：医疗防护设备批量采购"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">品类 *</label>
                  <select
                    required
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-400 focus:ring-1 focus:ring-teal-400 outline-none transition-colors bg-white"
                  >
                    <option value="">选择品类</option>
                    <option>医疗耗材</option>
                    <option>新能源</option>
                    <option>工程机械</option>
                    <option>教育/IT</option>
                    <option>农业</option>
                    <option>建筑材料</option>
                    <option>纺织服装</option>
                    <option>其他</option>
                  </select>
                </div>
              </div>

              {/* 预算 + 截止日期 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">预算金额 (USD) *</label>
                  <input
                    required
                    value={formData.budget}
                    onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-400 focus:ring-1 focus:ring-teal-400 outline-none transition-colors"
                    placeholder="如：500,000"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">截止日期 *</label>
                  <input
                    required
                    type="date"
                    value={formData.deadline}
                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-400 focus:ring-1 focus:ring-teal-400 outline-none transition-colors"
                  />
                </div>
              </div>

              {/* 需求描述 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">需求描述 *</label>
                <textarea
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={5}
                  className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-400 focus:ring-1 focus:ring-teal-400 outline-none transition-colors resize-none"
                  placeholder="请详细描述：采购品类、规格要求、数量、交付条件、资质要求等..."
                />
              </div>

              {/* 企业名称 + 联系邮箱 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">企业名称 *</label>
                  <input
                    required
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-400 focus:ring-1 focus:ring-teal-400 outline-none transition-colors"
                    placeholder="企业全称"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">联系邮箱 *</label>
                  <input
                    required
                    type="email"
                    value={formData.contact}
                    onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-400 focus:ring-1 focus:ring-teal-400 outline-none transition-colors"
                    placeholder="contact@company.com"
                  />
                </div>
              </div>

              {/* 合规提示 */}
              <div className="flex items-start gap-2.5 text-xs text-slate-500 bg-slate-50 rounded-xl p-4">
                <Shield className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                <span>提交后平台将进行企业资质核验，通常 1-2 个工作日内完成。通过后需求自动上线，联系方式默认对供应商保护，仅平台可见。</span>
              </div>

              {/* 提交按钮 */}
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-8 py-3 rounded-xl text-sm font-bold transition-colors shadow-sm"
                >
                  <Send className="w-4 h-4" />
                  提交审核
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      {/* ═ 已发布需求列表 ═══ */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-slate-900">已发布需求</h2>
          <span className="text-xs text-slate-400">{rfqs.filter((r) => r.status !== "closed").length} 个征集中</span>
        </div>
        {rfqs.map((rfq) => {
          const style = STATUS_STYLE[rfq.status];
          return (
            <div key={rfq.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition-shadow">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded border text-2xs font-bold ${style.bg} ${style.text}`}>{style.label}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-2xs text-slate-600 font-medium">{rfq.category}</span>
                  </div>
                  <h3 className="text-base font-extrabold text-slate-900 mb-1">{rfq.title}</h3>
                  <p className="text-xs text-slate-500">
                    {rfq.buyer} · {rfq.country} · 预算 {rfq.budget}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-slate-400">截止 {rfq.deadline}</p>
                  {rfq.status !== "closed" && (
                    <p className="text-sm font-bold text-rose-600">剩余 {rfq.daysLeft} 天</p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">{rfq.responses} 家供应商已响应</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </ErrorBoundary>
  );
}
