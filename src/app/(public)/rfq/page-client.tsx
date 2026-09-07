"use client";

/**
 * RFQ 采购需求发布页（模块13）
 * RFQ Page — Module 13
 *
 * @module app/(public)/rfq/page-client
 * @description 采购方发布表单 + RFQ 列表 + 供应商响应。
 *              P0：静态 Mock 数据，表单 UI 完整，提交后本地状态更新。
 */
import { useState } from "react";
import {
  Send, FileText, Clock, Shield, ChevronDown, Building2,
} from "lucide-react";
import { useLocale } from "@/core/i18n";

/* ── Mock RFQ 数据 ─ */
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
  { id: 5, title: "建筑工程机械租赁", buyer: "某中东建设集团", country: "阿联酋", budget: "USD 800,000", deadline: "2026-12-01", daysLeft: 85, category: "工程机械", responses: 3, status: "open" },
  { id: 6, title: "实验室检验设备采购", buyer: "某国家疾控中心", country: "印度", budget: "USD 180,000", deadline: "2026-08-30", daysLeft: 0, category: "医疗设备", responses: 20, status: "closed" },
];

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  open: { bg: "bg-teal-50 border-teal-200", text: "text-teal-700", label: "征集中" },
  closing: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", label: "即将截止" },
  closed: { bg: "bg-slate-50 border-slate-200", text: "text-slate-500", label: "已截止" },
};

export default function PageClient() {
  const { t } = useLocale();
  const [rfqs] = useState<RfqItem[]>(MOCK_RFQS);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ title: "", category: "", budget: "", deadline: "", description: "", company: "", contact: "" });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => { setShowForm(false); setSubmitted(false); setFormData({ title: "", category: "", budget: "", deadline: "", description: "", company: "", contact: "" }); }, 3000);
  };

  return (
    <div className="space-y-6">
      {/* ══ 深色页头 ═══ */}
      <section className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-900 rounded-2xl px-5 sm:px-6 py-8">
        <h1 className="text-2xl md:text-3xl font-extrabold text-white">
          RFQ 采购需求市场
          <span className="text-base font-bold text-slate-300 ml-2">|</span>
          <span className="text-base font-bold text-slate-300 ml-2">采购方发布 · 供应商响应 · 平台撮合</span>
        </h1>
        <p className="text-slate-400 text-sm mt-2 max-w-3xl">
          坚决不展示无法核验的假采购需求。过期 RFQ 自动下线，采购方联系方式默认保护。
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-colors"
          >
            <Send className="w-4 h-4" /> 发布采购需求
          </button>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5 text-teal-400" /> 需求核验</span>
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-amber-400" /> 过期自动下线</span>
            <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5 text-blue-400" /> 联系方式保护</span>
          </div>
        </div>
      </section>

      {/* ══ 发布表单弹窗 ═══ */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {submitted ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-teal-100 mb-4">
                  <Shield className="w-8 h-8 text-teal-600" />
                </div>
                <h3 className="text-lg font-extrabold text-slate-900 mb-2">需求已提交审核</h3>
                <p className="text-sm text-slate-500">平台将在 1-2 个工作日内完成核验，通过后自动上线。</p>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-extrabold text-slate-900 mb-4">发布采购需求</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">需求标题 *</label>
                      <input required value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-teal-400 outline-none" placeholder="如：医疗防护设备批量采购" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">品类 *</label>
                      <select required value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-teal-400 outline-none">
                        <option value="">选择品类</option>
                        <option>医疗耗材</option><option>新能源</option><option>工程机械</option><option>教育/IT</option><option>农业</option><option>其他</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">预算金额 (USD) *</label>
                      <input required value={formData.budget} onChange={(e) => setFormData({ ...formData, budget: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-teal-400 outline-none" placeholder="如：500,000" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">截止日期 *</label>
                      <input required type="date" value={formData.deadline} onChange={(e) => setFormData({ ...formData, deadline: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-teal-400 outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">需求描述 *</label>
                    <textarea required value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={4} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-teal-400 outline-none resize-none" placeholder="详细描述采购需求、规格要求、交付条件等..." />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">企业名称 *</label>
                      <input required value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-teal-400 outline-none" placeholder="企业全称" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">联系邮箱 *</label>
                      <input required type="email" value={formData.contact} onChange={(e) => setFormData({ ...formData, contact: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-teal-400 outline-none" placeholder="contact@company.com" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 rounded-lg p-3">
                    <Shield className="w-4 h-4 text-teal-600 shrink-0" />
                    <span>提交后平台将进行企业资质核验，通过后需求自动上线。联系方式默认对供应商保护。</span>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">取消</button>
                    <button type="submit" className="px-6 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold">提交审核</button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══ RFQ 列表 ═══ */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-slate-900">最新采购需求</h2>
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
                    {rfq.daysLeft <= 7 && rfq.status === "open" && (
                      <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-2xs font-bold text-rose-600">即将截止</span>
                    )}
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
              {rfq.status !== "closed" && (
                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                  <button className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-colors">
                    立即报价
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
