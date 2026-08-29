/**
 * 供应商国际招投标能力测试（手机扫码直达）
 * Supplier International Bidding Capability Test Form
 *
 * @module features/procurement/pages/QualificationFormPage
 * @description 公采系列 — 独立全屏表单页，供手机扫码直接访问填写。
 *              14 字段渲染委托给 shared/forms/QualificationFormFields，
 *              本组件仅负责页面外壳、提交逻辑与评分结果展示。
 */

import { useState, useMemo } from "react";
import { CheckCircle2, Send, ArrowLeft, Building2, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "@/core/i18n";
import { NAVY, GREEN, GREEN_HOVER, BG_LIGHT } from "@/shared/constants/colors";
import { submitSupplierQualification } from "../api/qualification";
import { ApiError } from "@/core/http";
import { scoreQualification, type ScoringResult } from "../utils/scoringEngine";
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

export default function QualificationFormPage() {
  const { t } = useLocale();
  const [form, setForm] = useState<QualificationFormState>(INITIAL_QUALIFICATION_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [qualificationId, setQualificationId] = useState<number | null>(null);
  const [scoreResult, setScoreResult] = useState<ScoringResult | null>(null);

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
      const res = await submitSupplierQualification({
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
      const result = scoreQualification(form as Parameters<typeof scoreQualification>[0]);
      setQualificationId(res.id);
      setScoreResult(result);
      toast.success(t("qualSuccessTitle"));
      setSubmitted(true);
    } catch (err) {
      toast.error(err instanceof ApiError && err.message ? err.message : t("qualErrorNetwork"));
    } finally {
      setLoading(false);
    }
  };

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

  // ─ 提交成功页 ─
  if (submitted) {
    const AMBER = "#D97706";
    const RED = "#DC2626";
    const gradeColor = scoreResult?.grade === "A" ? GREEN : scoreResult?.grade === "B" ? AMBER : RED;
    return (
      <div className="min-h-screen px-4 py-6" style={{ background: BG_LIGHT }}>
        <div className="max-w-lg mx-auto space-y-5">
          <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-teal-50 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-teal-600" />
            </div>
            <h1 className="text-lg font-bold text-slate-900 mb-1">{t("qualSuccessTitle")}</h1>
            <p className="text-sm text-slate-500 leading-relaxed mb-4">{t("qualSuccessDesc")}</p>
            <button
              type="button"
              onClick={() => { setSubmitted(false); setForm(INITIAL_QUALIFICATION_FORM); setQualificationId(null); setScoreResult(null); }}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold text-white transition-colors"
              style={{ background: GREEN }}
              onMouseEnter={(e) => (e.currentTarget.style.background = GREEN_HOVER)}
              onMouseLeave={(e) => (e.currentTarget.style.background = GREEN)}
            >
              <Send className="w-4 h-4" />
              {t("qualSubmitAgain")}
            </button>
          </div>

          {scoreResult && (
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5" style={{ color: NAVY }} />
                <h2 className="text-base font-bold" style={{ color: NAVY }}>{t("qualScoreTitle")}</h2>
              </div>
              <div className="flex items-center gap-4 mb-5">
                <div className="w-20 h-20 rounded-2xl flex flex-col items-center justify-center text-white shadow-md" style={{ background: gradeColor }}>
                  <span className="text-2xl font-black">{scoreResult.grade}</span>
                  <span className="text-xs opacity-90">{scoreResult.totalScore}{t("qualScorePoint")}</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-800">{scoreResult.gradeLabel}</p>
                  <p className="text-xs text-slate-500 mt-1">{scoreResult.gradePath}</p>
                </div>
              </div>
              {scoreResult.overrideGateTriggered && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100">
                  <p className="text-xs text-red-600">⚠ {scoreResult.overrideGateReason}</p>
                </div>
              )}
              <div className="space-y-2.5 mb-5">
                {scoreResult.dimensions.map((d) => {
                  const ratio = d.rawScore / 5;
                  const barColor = ratio >= 0.8 ? GREEN : ratio >= 0.6 ? "#D97706" : "#DC2626";
                  return (
                    <div key={d.no}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-slate-600 truncate flex-1">
                          {d.no}. {d.name}
                          {d.needsManualReview && <span className="ml-1 text-amber-500" title={t("qualScoreNeedsReview")}>●</span>}
                        </span>
                        <span className="text-xs font-mono text-slate-500 ml-2 shrink-0">{d.weightedScore}/{d.weight}</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${ratio * 100}%`, background: barColor }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mb-5">
                <h3 className="text-xs font-bold text-slate-700 mb-2">{t("qualScoreTopGaps")}</h3>
                <div className="space-y-1">
                  {scoreResult.topGaps.map((g, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-mono shrink-0">{i + 1}</span>
                      <span className="text-slate-600 flex-1 truncate">{g.dimension}</span>
                      <span className={`px-1.5 py-0.5 rounded text-white text-[10px] font-bold shrink-0 ${
                        g.priority === "High" ? "bg-red-500" : g.priority === "Medium" ? "bg-amber-500" : "bg-green-500"
                      }`}>{g.priority}</span>
                    </div>
                  ))}
                </div>
              </div>
              {qualificationId && (
                <a
                  href={`/api/supplier-qualification/${qualificationId}/report`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98]"
                  style={{ background: NAVY }}
                >
                  <Download className="w-4 h-4" />
                  {t("qualScoreDownloadPdf")}
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─ 表单页 ─
  return (
    <div className="min-h-screen" style={{ background: BG_LIGHT }}>
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button type="button" onClick={() => window.history.back()} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors" aria-label="返回">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <Building2 className="w-5 h-5 text-[#0A2A55] shrink-0" />
            <h1 className="text-base font-bold text-[#0A2A55] truncate">{t("qualPageTitle")}</h1>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 pt-6 pb-4">
        <div className="rounded-xl bg-gradient-to-br from-[#0A2A55] to-[#1a4a7a] p-5 text-white shadow-lg">
          <p className="text-sm leading-relaxed opacity-95">{t("qualPageDesc")}</p>
          <p className="text-xs mt-3 opacity-75">{t("qualPagePrivacy")}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto px-4 pb-10">
        <div className="space-y-5">
          <QualificationFormFields
            form={form}
            update={update}
            toggleIndustry={toggleIndustry}
            toggleCert={toggleCert}
            label={label}
            options={options}
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-3.5 text-base font-bold text-white shadow-md disabled:opacity-60 disabled:cursor-not-allowed transition-all hover:shadow-lg active:scale-[0.98]"
            style={{ background: GREEN }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = GREEN_HOVER; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = GREEN; }}
          >
            <Send className="w-5 h-5" />
            {loading ? t("qualSubmitting") : t("qualSubmitBtn")}
          </button>
          <p className="text-center text-xs text-slate-400 pb-4">{t("qualAgreeText")}</p>
        </div>
      </form>
    </div>
  );
}

QualificationFormPage.displayName = "QualificationFormPage";
