/**
 * 企业全球采购机会诊断 — 独立表单页（手机扫码直达）
 * Enterprise Global Procurement Diagnosis — Standalone Form Page
 *
 * @module features/training/pages/TrainingFormPage
 * @description 独立全屏表单页，供手机扫码直接访问填写。
 *              14 字段渲染委托给 shared/forms/QualificationFormFields，
 *              本组件仅负责页面外壳、提交逻辑与成功页。
 *              统一提交到 /api/supplier-qualification（source=diagnosis）。
 */

import { useState, useMemo } from "react";
import { CheckCircle2, Send, ArrowLeft } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { NAVY, GREEN, GREEN_HOVER, BG_LIGHT } from "../components/landing-ui";
import { ApiError } from "@/core/http";
import {
  QualificationFormFields,
  INITIAL_QUALIFICATION_FORM,
  type QualificationFormState,
  type QualFieldKey,
} from "@/shared/forms/QualificationFormFields";
import {
  getEmployeeOptions, getIndustryOptions, getExportOptions,
  getCertOptions, getUngmOptions, getEnglishTeamOptions,
  getPaymentOptions, getBidOptions,
} from "@/shared/data/qualificationOptions";

export default function TrainingFormPage() {
  const { t, locale } = useLocale();
  const [form, setForm] = useState<QualificationFormState>(INITIAL_QUALIFICATION_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const options = useMemo(() => ({
    employee: getEmployeeOptions(t),
    industry: getIndustryOptions(t),
    exportScale: getExportOptions(t),
    cert: getCertOptions(t),
    ungm: getUngmOptions(t),
    englishTeam: getEnglishTeamOptions(t),
    payment: getPaymentOptions(t),
    bid: getBidOptions(t),
  }), [t]);

  const update = <K extends keyof QualificationFormState>(key: K, val: QualificationFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));
  const toggleIndustry = (val: string) =>
    update("industry", form.industry.includes(val) ? form.industry.filter((i) => i !== val) : [...form.industry, val]);
  const toggleCert = (val: string) =>
    update("certifications", form.certifications.includes(val) ? form.certifications.filter((c) => c !== val) : [...form.certifications, val]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.company_name.trim()) return setError(t("qualErrorCompanyName"));
    if (form.industry.length === 0) return setError(t("qualErrorIndustry"));
    if (!form.main_product.trim()) return setError(t("qualErrorMainProduct"));
    if (!form.export_scale) return setError(t("qualErrorExportScale"));
    if (form.certifications.length === 0) return setError(t("qualErrorCertifications"));
    if (!form.service_countries.trim()) return setError(t("qualErrorServiceCountries"));
    if (!form.overseas_companies.trim()) return setError(t("qualErrorOverseasCompanies"));
    if (!form.ungm_status) return setError(t("qualErrorUngmStatus"));
    if (!form.english_team) return setError(t("qualErrorEnglishTeam"));
    if (!form.payment_terms) return setError(t("qualErrorPaymentTerms"));
    if (!form.bid_willingness) return setError(t("qualErrorBidWillingness"));

    setLoading(true);
    try {
      const { api } = await import("@/core/http");
      await api("/api/supplier-qualification", {
        method: "POST",
        body: { ...form, source: "diagnosis" },
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("qualErrorNetwork"));
    } finally {
      setLoading(false);
    }
  };

  // 使用 qual* 翻译 key（与 QualificationFormPage 共享同一套翻译）
  const label = (key: QualFieldKey) => {
    const map: Record<QualFieldKey, string> = {
      companyName: t("qualCompanyName"),
      companyWebsite: t("qualCompanyWebsite"),
      foundingYear: t("qualFoundingYear"),
      employeeCount: t("qualEmployeeCount"),
      industry: t("qualIndustry"),
      mainProduct: t("qualMainProduct"),
      exportScale: t("qualExportScale"),
      certifications: t("qualCertifications"),
      serviceCountries: t("qualServiceCountries"),
      overseasCompanies: t("qualOverseasCompanies"),
      ungmStatus: t("qualUngmStatus"),
      englishTeam: t("qualEnglishTeam"),
      paymentTerms: t("qualPaymentTerms"),
      bidWillingness: t("qualBidWillingness"),
    };
    return map[key];
  };

  // ── 提交成功页 ──
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: BG_LIGHT }}>
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-[#0AA09B]/10 flex items-center justify-center mb-6">
            <CheckCircle2 className="w-12 h-12 text-[#0AA09B]" />
          </div>
          <h1 className="text-xl font-black text-[#0A2A55] mb-3">{t("qualDiagSubmitted")}</h1>
          <p className="text-sm text-slate-500 leading-relaxed mb-8">{t("qualDiagSubmittedDesc")}</p>
          <button
            type="button"
            onClick={() => { setSubmitted(false); setForm(INITIAL_QUALIFICATION_FORM); }}
            className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-black text-white"
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

  // ── 表单页 ──
  return (
    <div className="min-h-screen" style={{ background: BG_LIGHT }}>
      <header className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3" style={{ background: NAVY }}>
        <button type="button" onClick={() => window.history.back()} className="text-white/80 hover:text-white cursor-pointer" aria-label="返回">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-black text-white">{t("qualDiagTitle")}</h1>
      </header>

      <div className="px-4 pt-6 pb-4">
        <div className="max-w-lg mx-auto">
          <p className="text-sm text-slate-600 leading-relaxed">{t("qualDiagDesc")}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="px-4 pb-10">
        <div className="max-w-lg mx-auto space-y-5">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div>
          )}
          <QualificationFormFields
            form={form}
            update={update}
            toggleIndustry={toggleIndustry}
            toggleCert={toggleCert}
            label={label}
            options={options}
            className="rounded-2xl border border-[#E5EBF3] bg-white p-5 shadow-sm space-y-5"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-3.5 text-base font-black text-white shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: GREEN }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = GREEN_HOVER; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = GREEN; }}
          >
            <Send className="w-5 h-5" />
            {loading ? t("qualSubmitting") : t("qualDiagSubmitBtn")}
          </button>
          <p className="text-center text-xs text-slate-400 pb-4">{t("qualAgreeText")}</p>
        </div>
      </form>
    </div>
  );
}

TrainingFormPage.displayName = "TrainingFormPage";
