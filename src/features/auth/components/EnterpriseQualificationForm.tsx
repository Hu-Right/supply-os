/**
 * EnterpriseQualificationForm - 企业全球采购机会诊断表单
 * 嵌入注册流程的企业注册环节
 *
 * @module features/auth/components/EnterpriseQualificationForm
 */
import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Input } from "@/shared/ui";
import { submitSupplierQualification } from "@/features/procurement/api/qualification";
import { ApiError } from "@/core/http";
import {
  getEmployeeOptions, getIndustryOptions, getExportOptions,
  getCertOptions, getUngmOptions, getEnglishTeamOptions,
  getPaymentOptions, getBidOptions,
  type QualOption,
} from "@/features/procurement/utils/qualificationOptions";

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

interface EnterpriseQualificationFormProps {
  onSuccess: () => void;
}

export default function EnterpriseQualificationForm({ onSuccess }: EnterpriseQualificationFormProps) {
  const { t } = useLocale();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 本地化选项
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

    if (!form.company_name.trim()) return setError(t("eqfCompanyNameRequired"));
    if (!form.company_website.trim()) return setError(t("eqfCompanyWebsiteRequired"));
    if (form.industry.length === 0) return setError(t("eqfIndustryRequired"));
    if (!form.main_product.trim()) return setError(t("eqfMainProductRequired"));
    if (!form.export_scale) return setError(t("eqfExportScaleRequired"));
    if (form.certifications.length === 0) return setError(t("eqfCertRequired"));
    if (!form.service_countries.trim()) return setError(t("eqfServiceCountriesRequired"));
    if (!form.overseas_companies.trim()) return setError(t("eqfOverseasRequired"));
    if (!form.ungm_status) return setError(t("eqfUngmRequired"));
    if (!form.english_team) return setError(t("eqfEnglishRequired"));
    if (!form.payment_terms) return setError(t("eqfPaymentRequired"));
    if (!form.bid_willingness) return setError(t("eqfBidRequired"));

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
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError && err.message ? err.message : t("eqfSubmitError"));
    } finally {
      setLoading(false);
    }
  };

  // ── 提交成功：显示客服引导卡片 ──
  if (submitted) {
    return (
      <div className="rounded-xl border border-teal-200 bg-teal-50 p-6 text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-full bg-teal-100 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-teal-600" />
        </div>
        <h3 className="text-base font-bold text-teal-800">{t("eqfSuccessTitle")}</h3>
        <p className="text-sm text-teal-700 leading-relaxed">{t("eqfSuccessDesc")}</p>
        <div className="flex justify-center">
          <img src="/wechat-service-qr.png" alt="WeChat QR"
            className="w-40 h-40 rounded-xl border-2 border-white shadow-md" />
        </div>
        <p className="text-xs text-teal-600">{t("eqfSuccessHint")}</p>
        <button type="button" onClick={onSuccess}
          className="inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold text-white transition-colors bg-[#0CAF8C] hover:bg-[#099a7a]">
          <Send className="w-4 h-4" />
          {t("eqfCompleteRegister")}
        </button>
      </div>
    );
  }

  // ── 表单 ──
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-extrabold text-slate-900">{t("eqfTitle")}</h4>
          <span className="text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-1">
            {t("eqfBadge")}
          </span>
        </div>

        {/* 1. 企业名称 */}
        <div>
          <FieldLabel required>1. {t("eqfCompanyName")}:</FieldLabel>
          <TextArea value={form.company_name} onChange={(v) => update("company_name", v)}
            placeholder={t("eqfEnterCompany")} rows={2} />
        </div>

        {/* 2. 企业官网 */}
        <div>
          <FieldLabel required>2. {t("eqfCompanyWebsite")}:</FieldLabel>
          <Input type="url" value={form.company_website}
            onChange={(e) => update("company_website", e.target.value)} placeholder="https://" />
        </div>

        {/* 3. 成立年份 */}
        <div>
          <FieldLabel>3. {t("eqfFoundingYear")}:</FieldLabel>
          <Input type="text" value={form.founding_year}
            onChange={(e) => update("founding_year", e.target.value)} placeholder={t("eqfEnterYears")} />
        </div>

        {/* 4. 员工规模 */}
        <div>
          <FieldLabel>4. {t("eqfEmployeeCount")}:</FieldLabel>
          <RadioButtons name="employee_count" value={form.employee_count}
            options={empOpts} onChange={(v) => update("employee_count", v)} />
        </div>

        {/* 5. 所属行业 */}
        <div>
          <FieldLabel required>5. {t("eqfIndustry")}:</FieldLabel>
          <CheckboxButtons options={indOpts} selected={form.industry} onToggle={toggleIndustry} />
          {form.industry.includes("其他（请注明）") && (
            <div className="mt-3">
              <Input type="text" value={form.other_industry}
                onChange={(e) => update("other_industry", e.target.value)}
                placeholder={t("eqfOtherIndustry")} />
            </div>
          )}
        </div>

        {/* 6. 主营产品 */}
        <div>
          <FieldLabel required>6. {t("eqfMainProduct")}:</FieldLabel>
          <Input type="text" value={form.main_product}
            onChange={(e) => update("main_product", e.target.value)}
            placeholder={t("eqfEnterProduct")} />
        </div>

        {/* 7. 出口规模 */}
        <div>
          <FieldLabel required>7. {t("eqfExportScale")}:</FieldLabel>
          <RadioButtons name="export_scale" value={form.export_scale}
            options={expOpts} onChange={(v) => update("export_scale", v)} />
        </div>

        {/* 8. 资质证书 */}
        <div>
          <FieldLabel required>8. {t("eqfCertifications")}:</FieldLabel>
          <CheckboxButtons options={certOpts} selected={form.certifications} onToggle={toggleCert} />
          <div className="mt-3">
            <Input type="text" value={form.other_certifications}
              onChange={(e) => update("other_certifications", e.target.value)}
              placeholder={t("eqfOtherCertifications")} />
          </div>
        </div>

        {/* 9. 服务国家 */}
        <div>
          <FieldLabel required>9. {t("eqfServiceCountries")}:</FieldLabel>
          <TextArea value={form.service_countries} onChange={(v) => update("service_countries", v)}
            placeholder={t("eqfEnterCountries")} />
        </div>

        {/* 10. 海外分公司 */}
        <div>
          <FieldLabel required>10. {t("eqfOverseasCompanies")}:</FieldLabel>
          <TextArea value={form.overseas_companies} onChange={(v) => update("overseas_companies", v)}
            placeholder={t("eqfEnterCountries")} />
        </div>

        {/* 11. UNGM状态 */}
        <div>
          <FieldLabel required>11. {t("eqfUngmStatus")}:</FieldLabel>
          <RadioButtons name="ungm_status" value={form.ungm_status}
            options={ungmOpts} onChange={(v) => update("ungm_status", v)} />
        </div>

        {/* 12. 英文团队 */}
        <div>
          <FieldLabel required>12. {t("eqfEnglishTeam")}:</FieldLabel>
          <RadioButtons name="english_team" value={form.english_team}
            options={engOpts} onChange={(v) => update("english_team", v)} />
        </div>

        {/* 13. 账期 */}
        <div>
          <FieldLabel required>13. {t("eqfPaymentTerms")}:</FieldLabel>
          <RadioButtons name="payment_terms" value={form.payment_terms}
            options={payOpts} onChange={(v) => update("payment_terms", v)} />
        </div>

        {/* 14. 投标意愿 */}
        <div>
          <FieldLabel required>14. {t("eqfBidWillingness")}:</FieldLabel>
          <RadioButtons name="bid_willingness" value={form.bid_willingness}
            options={bidOpts} onChange={(v) => update("bid_willingness", v)} />
          {form.bid_willingness === "是" && (
            <div className="mt-3 p-3 rounded-lg bg-teal-50 border border-teal-100">
              <Input type="text" value={form.contact_info}
                onChange={(e) => update("contact_info", e.target.value)}
                placeholder={t("eqfContactInfo")} className="bg-white" />
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-3">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white shadow-md disabled:opacity-60 disabled:cursor-not-allowed transition-all bg-[#0CAF8C] hover:bg-[#099a7a]">
        <Send className="w-4 h-4" />
        {loading ? t("eqfSubmitting") : t("eqfSubmitBtn")}
      </button>
    </form>
  );
}
