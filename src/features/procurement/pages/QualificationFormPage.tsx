/**
 * 供应商国际招投标能力测试（手机扫码直达）
 * Supplier International Bidding Capability Test Form
 *
 * @module features/procurement/pages/QualificationFormPage
 * @description 公采系列 — 独立全屏表单页，供手机扫码直接访问填写。
 *              14 字段渲染委托给 shared/forms/QualificationFormFields，
 *              本组件仅负责页面外壳、提交逻辑与评分结果展示。
 */

import { useState, useMemo, useEffect } from "react";
import { CheckCircle2, Send, ArrowLeft, Building2 } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import { NAVY, GREEN, GREEN_HOVER, BG_LIGHT } from "@/shared/constants/colors";
import { submitSupplierQualification } from "../api/qualification";
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

export default function QualificationFormPage() {
  const { t } = useLocale();
  const [form, setForm] = useState<QualificationFormState>(INITIAL_QUALIFICATION_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [qualificationId, setQualificationId] = useState<number | null>(null);
  // 员工推广扫码归因：读取 /r/[code] 写入的 ref_code Cookie
  const [refCode, setRefCode] = useState<string | null>(null);

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)ref_code=([^;]+)/);
    if (match) setRefCode(decodeURIComponent(match[1]).toUpperCase());
  }, []);

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
    if (form.company_website.trim() && !/^https?:\/\/.+/i.test(form.company_website.trim())) return toast.error(t("qualErrorWebsiteFormat"));
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
        // 员工推广归因：将 ref_code Cookie 作为邀请码传递后端，解析为 employee_id
        ...(refCode ? { invitation_code: refCode } : {}),
      });
      setQualificationId(res.id);
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
    return (
      <div className="px-4 pt-8 pb-6">
        <div className="mx-auto max-w-sm">
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {/* 上半：提交成功 */}
            <div className="p-6 text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-teal-50 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8 text-teal-600" />
              </div>
              <h1 className="text-lg font-bold text-slate-900 mb-1">{t("qualSuccessTitle")}</h1>
              <p className="text-sm text-slate-500 leading-relaxed mb-5">{t("qualSuccessDesc")}</p>
              <button
                type="button"
                onClick={() => { setSubmitted(false); setForm(INITIAL_QUALIFICATION_FORM); setQualificationId(null); }}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold text-white transition-colors"
                style={{ background: GREEN }}
                onMouseEnter={(e) => (e.currentTarget.style.background = GREEN_HOVER)}
                onMouseLeave={(e) => (e.currentTarget.style.background = GREEN)}
              >
                <Send className="w-4 h-4" />
                {t("qualSubmitAgain")}
              </button>
            </div>

            {/* 分割线 */}
            <div className="mx-6 border-t border-slate-100" />

            {/* 下半：客服二维码 */}
            <div className="p-6 text-center">
              <Image
                src="/wechat-service-qr.png"
                alt="客服微信二维码"
                width={140}
                height={140}
                className="mx-auto rounded-lg"
              />
              <p className="mt-3 text-sm font-bold text-slate-800">{t("qualDiagQrTitle")}</p>
              <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">{t("qualDiagQrDesc")}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─ 表单页 ─
  return (
    <div className="min-h-screen" style={{ background: BG_LIGHT }}>
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button type="button" variant="ghost" size="iconSm" onClick={() => window.history.back()} aria-label="返回" className="hover:bg-slate-100">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </Button>
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <Building2 className="w-5 h-5 text-training-navy shrink-0" />
            <h1 className="text-base font-bold text-training-navy truncate">{t("qualPageTitle")}</h1>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 pt-6 pb-4">
        <div className="rounded-xl bg-gradient-to-br from-training-navy to-[#1a4a7a] p-5 text-white shadow-lg">
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
            placeholder={(key: string) => t(key)}
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
