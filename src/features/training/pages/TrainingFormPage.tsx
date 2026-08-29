/**
 * 企业全球采购机会诊断 — 独立表单页（手机扫码直达）
 * Enterprise Global Procurement Diagnosis — Standalone Form Page
 *
 * @module features/training/pages/TrainingFormPage
 * @description 独立全屏表单页，供手机扫码直接访问填写。
 *              14 字段与注册流程 / 资质测试完全一致，
 *              统一提交到 /api/supplier-qualification（source=diagnosis）。
 */

import { useState } from "react";
import { CheckCircle2, Send, ArrowLeft } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { Input } from "@/shared/ui";
import { NAVY, GREEN, GREEN_HOVER, BG_LIGHT } from "../components/landing-ui";
import { ApiError } from "@/core/http";
import {
  getEmployeeOptions, getIndustryOptions, getExportOptions,
  getCertOptions, getUngmOptions, getEnglishTeamOptions,
  getPaymentOptions, getBidOptions,
  type QualOption,
} from "@/features/procurement/utils/qualificationOptions";

// ── 表单状态（与 crm_supplier_qualification 14 字段对齐） ──

interface FormState {
  company_name: string; company_website: string; founding_year: string;
  employee_count: string; industry: string[]; other_industry: string;
  main_product: string; export_scale: string; certifications: string[];
  other_certifications: string; service_countries: string; overseas_companies: string;
  ungm_status: string; english_team: string; payment_terms: string;
  bid_willingness: string; contact_info: string;
}

const INITIAL_FORM: FormState = {
  company_name: "", company_website: "", founding_year: "", employee_count: "",
  industry: [], other_industry: "", main_product: "", export_scale: "",
  certifications: [], other_certifications: "", service_countries: "",
  overseas_companies: "", ungm_status: "", english_team: "",
  payment_terms: "", bid_willingness: "", contact_info: "",
};

// ── 工具组件 ──

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-bold text-slate-700 mb-2">
      {children}{required && <span className="text-rose-500 ml-0.5">*</span>}
    </label>
  );
}

function RadioButtons({ name, value, options, onChange }: {
  name: string; value: string; options: QualOption[]; onChange: (val: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button key={opt.value} type="button" onClick={() => onChange(opt.value)}
            className={`rounded-lg border px-3.5 py-2 text-sm font-medium transition-all ${
              active ? "border-[#0CAF8C] bg-[#0CAF8C] text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-600 hover:border-[#0CAF8C]/40 hover:bg-[#0CAF8C]/5"
            }`}>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function CheckboxButtons({ options, selected, onToggle }: {
  options: QualOption[]; selected: string[]; onToggle: (val: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt.value);
        return (
          <button key={opt.value} type="button" onClick={() => onToggle(opt.value)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-all ${
              active ? "border-[#0CAF8C] bg-[#0CAF8C] text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-600 hover:border-[#0CAF8C]/40 hover:bg-[#0CAF8C]/5"
            }`}>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function TextArea({ value, onChange, placeholder, rows = 3 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <textarea value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} rows={rows}
      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#0CAF8C]/20 focus:border-[#0CAF8C] focus:outline-none transition-all resize-none" />
  );
}

// ── 主组件 ──

export default function TrainingFormPage() {
  const { t, locale } = useLocale();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 选项（i18n 感知）
  const empOpts = getEmployeeOptions(t);
  const indOpts = getIndustryOptions(t);
  const expOpts = getExportOptions(t);
  const certOpts = getCertOptions(t);
  const ungmOpts = getUngmOptions(t);
  const engOpts = getEnglishTeamOptions(t);
  const payOpts = getPaymentOptions(t);
  const bidOpts = getBidOptions(t);

  const update = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));
  const toggleIndustry = (val: string) =>
    update("industry", form.industry.includes(val) ? form.industry.filter((i) => i !== val) : [...form.industry, val]);
  const toggleCert = (val: string) =>
    update("certifications", form.certifications.includes(val) ? form.certifications.filter((c) => c !== val) : [...form.certifications, val]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // 必填校验
    if (!form.company_name.trim()) return setError(pickLocale(locale, "请填写企业名称", "Please enter company name"));
    if (form.industry.length === 0) return setError(pickLocale(locale, "请选择所属行业", "Please select industry"));
    if (!form.main_product.trim()) return setError(pickLocale(locale, "请填写主营产品", "Please enter main product"));
    if (!form.export_scale) return setError(pickLocale(locale, "请选择出口规模", "Please select export scale"));
    if (form.certifications.length === 0) return setError(pickLocale(locale, "请选择资质证书", "Please select certifications"));
    if (!form.service_countries.trim()) return setError(pickLocale(locale, "请填写服务国家", "Please enter service countries"));
    if (!form.overseas_companies.trim()) return setError(pickLocale(locale, "请填写海外分公司", "Please enter overseas companies"));
    if (!form.ungm_status) return setError(pickLocale(locale, "请选择UNGM状态", "Please select UNGM status"));
    if (!form.english_team) return setError(pickLocale(locale, "请选择英文团队能力", "Please select English team capability"));
    if (!form.payment_terms) return setError(pickLocale(locale, "请选择账期接受度", "Please select payment terms"));
    if (!form.bid_willingness) return setError(pickLocale(locale, "请选择投标意愿", "Please select bid willingness"));

    setLoading(true);
    try {
      const { api } = await import("@/core/http");
      await api("/api/supplier-qualification", {
        method: "POST",
        body: {
          ...form,
          source: "diagnosis",
        },
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : pickLocale(locale, "提交失败，请稍后重试", "Submission failed, please try again"));
    } finally {
      setLoading(false);
    }
  };

  // ── 提交成功页 ──
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: BG_LIGHT }}>
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-[#0AA09B]/10 flex items-center justify-center mb-6">
            <CheckCircle2 className="w-12 h-12 text-[#0AA09B]" />
          </div>
          <h1 className="text-xl font-black text-[#0A2A55] mb-3">
            {pickLocale(locale, "诊断问卷已提交", "Diagnosis Submitted")}
          </h1>
          <p className="text-sm text-slate-500 leading-relaxed mb-8">
            {pickLocale(locale, "感谢您的填写，我们将尽快为您评估并出具诊断报告。", "Thank you for your submission. We will evaluate and generate your diagnosis report shortly.")}
          </p>
          <button
            type="button"
            onClick={() => { setSubmitted(false); setForm(INITIAL_FORM); }}
            className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-black text-white"
            style={{ background: GREEN }}
            onMouseEnter={(e) => (e.currentTarget.style.background = GREEN_HOVER)}
            onMouseLeave={(e) => (e.currentTarget.style.background = GREEN)}
          >
            <Send className="w-4 h-4" />
            {pickLocale(locale, "重新填写", "Fill Again")}
          </button>
        </div>
      </div>
    );
  }

  // ── 表单页 ──
  return (
    <div className="min-h-screen" style={{ background: BG_LIGHT }}>
      {/* 顶部栏 */}
      <header className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3" style={{ background: NAVY }}>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="text-white/80 hover:text-white cursor-pointer"
          aria-label="返回"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-black text-white">
          {pickLocale(locale, "企业全球采购机会诊断", "Enterprise Global Procurement Diagnosis")}
        </h1>
      </header>

      {/* 说明区 */}
      <div className="px-4 pt-6 pb-4">
        <div className="max-w-lg mx-auto">
          <p className="text-sm text-slate-600 leading-relaxed">
            {pickLocale(
              locale,
              "填写以下 14 项企业信息，我们将根据您的情况评估全球采购入驻资格并出具诊断报告。",
              "Fill in the 14 fields below. We will evaluate your global procurement eligibility and generate a diagnosis report based on your company profile.",
            )}
          </p>
        </div>
      </div>

      {/* 表单 */}
      <form onSubmit={handleSubmit} className="px-4 pb-10">
        <div className="max-w-lg mx-auto space-y-5">
          {/* 错误提示 */}
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">
              {error}
            </div>
          )}

          <div className="rounded-2xl border border-[#E5EBF3] bg-white p-5 shadow-sm space-y-5">
            {/* 1. 企业名称 */}
            <div>
              <FieldLabel required>1. {pickLocale(locale, "企业名称", "Company Name")}:</FieldLabel>
              <TextArea value={form.company_name} onChange={(v) => update("company_name", v)}
                placeholder={pickLocale(locale, "请输入企业全称", "Enter full company name")} rows={1} />
            </div>

            {/* 2. 企业官网 */}
            <div>
              <FieldLabel required>2. {pickLocale(locale, "企业官网", "Company Website")}:</FieldLabel>
              <Input type="url" value={form.company_website}
                onChange={(e) => update("company_website", e.target.value)} placeholder="https://" />
            </div>

            {/* 3. 成立年份 */}
            <div>
              <FieldLabel>3. {pickLocale(locale, "成立年份", "Founding Year")}:</FieldLabel>
              <Input type="text" value={form.founding_year}
                onChange={(e) => update("founding_year", e.target.value)} placeholder={pickLocale(locale, "如 2010", "e.g. 2010")} />
            </div>

            {/* 4. 员工规模 */}
            <div>
              <FieldLabel>4. {pickLocale(locale, "员工规模", "Employee Count")}:</FieldLabel>
              <RadioButtons name="employee_count" value={form.employee_count}
                options={empOpts} onChange={(v) => update("employee_count", v)} />
            </div>

            {/* 5. 所属行业 */}
            <div>
              <FieldLabel required>5. {pickLocale(locale, "所属行业", "Industry")}:</FieldLabel>
              <CheckboxButtons options={indOpts} selected={form.industry} onToggle={toggleIndustry} />
              {form.industry.includes("其他（请注明）") && (
                <div className="mt-3">
                  <Input type="text" value={form.other_industry}
                    onChange={(e) => update("other_industry", e.target.value)}
                    placeholder={pickLocale(locale, "请注明其他行业", "Please specify")} />
                </div>
              )}
            </div>

            {/* 6. 主营产品 */}
            <div>
              <FieldLabel required>6. {pickLocale(locale, "主营产品", "Main Product")}:</FieldLabel>
              <Input type="text" value={form.main_product}
                onChange={(e) => update("main_product", e.target.value)}
                placeholder={pickLocale(locale, "请输入主营产品", "Enter main product")} />
            </div>

            {/* 7. 出口规模 */}
            <div>
              <FieldLabel required>7. {pickLocale(locale, "出口规模", "Export Scale")}:</FieldLabel>
              <RadioButtons name="export_scale" value={form.export_scale}
                options={expOpts} onChange={(v) => update("export_scale", v)} />
            </div>

            {/* 8. 资质证书 */}
            <div>
              <FieldLabel required>8. {pickLocale(locale, "资质证书", "Certifications")}:</FieldLabel>
              <CheckboxButtons options={certOpts} selected={form.certifications} onToggle={toggleCert} />
              <div className="mt-3">
                <Input type="text" value={form.other_certifications}
                  onChange={(e) => update("other_certifications", e.target.value)}
                  placeholder={pickLocale(locale, "其他资质证书", "Other certifications")} />
              </div>
            </div>

            {/* 9. 服务国家 */}
            <div>
              <FieldLabel required>9. {pickLocale(locale, "售后服务国家", "Service Countries")}:</FieldLabel>
              <TextArea value={form.service_countries} onChange={(v) => update("service_countries", v)}
                placeholder={pickLocale(locale, "售后点/服务站所在国家", "Countries with after-sales service points")} />
            </div>

            {/* 10. 海外分公司 */}
            <div>
              <FieldLabel required>10. {pickLocale(locale, "海外机构", "Overseas Companies")}:</FieldLabel>
              <TextArea value={form.overseas_companies} onChange={(v) => update("overseas_companies", v)}
                placeholder={pickLocale(locale, "海外分公司/投资公司所在国家", "Countries with overseas branches")} />
            </div>

            {/* 11. UNGM 状态 */}
            <div>
              <FieldLabel required>11. UNGM {pickLocale(locale, "注册状态", "Status")}:</FieldLabel>
              <RadioButtons name="ungm_status" value={form.ungm_status}
                options={ungmOpts} onChange={(v) => update("ungm_status", v)} />
            </div>

            {/* 12. 英文团队 */}
            <div>
              <FieldLabel required>12. {pickLocale(locale, "英文团队", "English Team")}:</FieldLabel>
              <RadioButtons name="english_team" value={form.english_team}
                options={engOpts} onChange={(v) => update("english_team", v)} />
            </div>

            {/* 13. 账期 */}
            <div>
              <FieldLabel required>13. {pickLocale(locale, "账期接受度", "Payment Terms")}:</FieldLabel>
              <RadioButtons name="payment_terms" value={form.payment_terms}
                options={payOpts} onChange={(v) => update("payment_terms", v)} />
            </div>

            {/* 14. 投标意愿 */}
            <div>
              <FieldLabel required>14. {pickLocale(locale, "投标意愿", "Bid Willingness")}:</FieldLabel>
              <RadioButtons name="bid_willingness" value={form.bid_willingness}
                options={bidOpts} onChange={(v) => update("bid_willingness", v)} />
              {form.bid_willingness === "是" && (
                <div className="mt-3 p-3 rounded-lg bg-teal-50 border border-teal-100">
                  <Input type="text" value={form.contact_info}
                    onChange={(e) => update("contact_info", e.target.value)}
                    placeholder={pickLocale(locale, "联系人微信及电话", "Contact WeChat & phone")} className="bg-white" />
                </div>
              )}
            </div>
          </div>

          {/* 提交按钮 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-3.5 text-base font-black text-white shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: GREEN }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = GREEN_HOVER; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = GREEN; }}
          >
            <Send className="w-5 h-5" />
            {loading
              ? pickLocale(locale, "提交中...", "Submitting...")
              : pickLocale(locale, "提交诊断问卷", "Submit Diagnosis")}
          </button>

          <p className="text-center text-xs text-slate-400 pb-4">
            {pickLocale(locale, "提交即表示您同意我们收集并使用上述信息", "By submitting you agree to our data collection policy")}
          </p>
        </div>
      </form>
    </div>
  );
}

TrainingFormPage.displayName = "TrainingFormPage";
