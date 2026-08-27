/**
 * 企业全球采购机会诊断（手机扫码直达）
 * Enterprise Global Procurement Opportunity Diagnosis Form
 *
 * @module features/procurement/pages/QualificationFormPage
 * @description 公采系列 — 独立全屏表单页，供手机扫码直接访问填写。
 *              复用 QualificationForm 组件，仅负责页面布局和提交逻辑。
 *              提交后数据写入 crm_supplier_qualification 表（独立表）。
 */

import { useState } from "react";
import { CheckCircle2, Send, ArrowLeft, Building2 } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "@/core/i18n";
import { ApiError } from "@/core/http";
import { submitSupplierQualification } from "../api/qualification";
import QualificationForm, {
  INITIAL_QUALIFICATION_FORM,
  type QualificationFormData,
} from "../components/QualificationForm";
import { GREEN, GREEN_HOVER, BG_LIGHT } from "@/features/training/components/landing-ui";

export default function QualificationFormPage() {
  const { t } = useLocale();
  const [form, setForm] = useState<QualificationFormData>(INITIAL_QUALIFICATION_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 前端必填校验
    if (!form.company_name.trim()) return toast.error(`${t("qualCompanyName")}${t("qualErrorRequired")}`);
    if (!form.company_website.trim()) return toast.error(`${t("qualCompanyWebsite")}${t("qualErrorRequired")}`);
    if (form.industry.length === 0) return toast.error(`${t("qualIndustry")}${t("qualErrorRequired")}`);
    if (!form.main_product.trim()) return toast.error(`${t("qualMainProduct")}${t("qualErrorRequired")}`);
    if (!form.export_scale) return toast.error(`${t("qualExportScale")}${t("qualErrorRequired")}`);
    if (form.certifications.length === 0) return toast.error(`${t("qualCertifications")}${t("qualErrorRequired")}`);
    if (!form.service_countries.trim()) return toast.error(`${t("qualServiceCountries")}${t("qualErrorRequired")}`);
    if (!form.overseas_companies.trim()) return toast.error(`${t("qualOverseasCompanies")}${t("qualErrorRequired")}`);
    if (!form.ungm_status) return toast.error(`${t("qualUngmStatus")}${t("qualErrorRequired")}`);
    if (!form.english_team) return toast.error(`${t("qualEnglishTeam")}${t("qualErrorRequired")}`);
    if (!form.payment_terms) return toast.error(`${t("qualPaymentTerms")}${t("qualErrorRequired")}`);
    if (!form.bid_willingness) return toast.error(`${t("qualBidWillingness")}${t("qualErrorRequired")}`);

    setLoading(true);
    try {
      await submitSupplierQualification({
        company_name: form.company_name.trim(),
        company_website: form.company_website.trim(),
        founding_year: form.founding_year.trim() || null,
        employee_count: form.employee_count || null,
        industry: form.industry,
        other_industry: form.other_industry.trim() || null,
        main_product: form.main_product.trim(),
        export_scale: form.export_scale,
        certifications: form.certifications,
        other_certifications: form.other_certifications.trim() || null,
        service_countries: form.service_countries.trim(),
        overseas_companies: form.overseas_companies.trim(),
        ungm_status: form.ungm_status,
        english_team: form.english_team,
        payment_terms: form.payment_terms,
        bid_willingness: form.bid_willingness,
        contact_info: form.contact_info.trim() || null,
      });
      toast.success(t("qualSuccessTitle"));
      setSubmitted(true);
    } catch (err) {
      toast.error(err instanceof ApiError && err.message ? err.message : t("qualErrorNetwork"));
    } finally {
      setLoading(false);
    }
  };

  // ─ 提交成功页 ──
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: BG_LIGHT }}>
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-teal-50 flex items-center justify-center mb-5">
            <CheckCircle2 className="w-10 h-10 text-teal-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">{t("qualSuccessTitle")}</h1>
          <p className="text-sm text-slate-500 leading-relaxed mb-6">{t("qualSuccessDesc")}</p>
          <button
            type="button"
            onClick={() => { setSubmitted(false); setForm(INITIAL_QUALIFICATION_FORM); }}
            className="inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-white transition-colors"
            style={{ background: GREEN }}
            onMouseEnter={(e) => (e.currentTarget.style.background = GREEN_HOVER)}
            onMouseLeave={(e) => (e.currentTarget.style.background = GREEN)}
          >
            <Send className="w-4 h-4" />
            {t("qualSubmitAgain")}
          </button>
        </div>
      </div>
    );
  }

  // ─ 表单页 ──
  return (
    <div className="min-h-screen" style={{ background: BG_LIGHT }}>
      {/* 顶部导航栏 */}
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="返回"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <Building2 className="w-5 h-5 text-[#0A2A55] shrink-0" />
            <h1 className="text-base font-bold text-[#0A2A55] truncate">{t("qualPageTitle")}</h1>
          </div>
        </div>
      </header>

      {/* 说明区 */}
      <div className="max-w-3xl mx-auto px-4 pt-6 pb-4">
        <div className="rounded-xl bg-gradient-to-br from-[#0A2A55] to-[#1a4a7a] p-5 text-white shadow-lg">
          <p className="text-sm leading-relaxed opacity-95">{t("qualPageDesc")}</p>
          <p className="text-xs mt-3 opacity-75">{t("qualPagePrivacy")}</p>
        </div>
      </div>

      {/* 表单 */}
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto px-4 pb-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <QualificationForm value={form} onChange={setForm} loading={loading} />
        </div>
        <p className="text-center text-xs text-slate-400 pt-4 pb-4">
          {t("qualAgreeText")}
        </p>
      </form>
    </div>
  );
}

QualificationFormPage.displayName = "QualificationFormPage";
