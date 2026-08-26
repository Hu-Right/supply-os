/**
 * 供应商国际招投标能力测试（手机扫码直达）
 * Supplier International Bidding Capability Test Form
 *
 * @module features/procurement/pages/QualificationFormPage
 * @description 公采系列 — 独立全屏表单页，供手机扫码直接访问填写。
 *              视觉风格与 TrainingRegisterForm 弹窗保持一致。
 *              字段对齐金数据表单 https://3qbnzjkj.jsjform.com/f/eVHrlR
 *              提交后数据写入 crm_supplier_qualification 表（独立表）。
 */

import { useState } from "react";
import { CheckCircle2, Send, ArrowLeft, Building2 } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "@/core/i18n";
import { Input } from "@/shared/ui";
import { NAVY, GREEN, GREEN_HOVER, BG_LIGHT } from "@/features/training/components/landing-ui";
import { submitSupplierQualification } from "../api/qualification";
import { ApiError } from "@/core/http";

// ── 选项常量 ──

const EMPLOYEE_OPTIONS = ["50人以下", "50-200人", "200-500人", "500人以上"];

const INDUSTRY_OPTIONS = [
  "农林牧渔业",
  "食品加工与食品、饮料制造业",
  "纺织业、化学纤维制造业",
  "服装、鞋帽、皮革制造业",
  "木材加工及木、竹、藤、棕、草制品、家具制造业",
  "纸制品、印刷业、文教体育、办公用品制造业",
  "非金属矿物制品业（含水泥、玻璃、陶瓷、耐火材料等）",
  "金属制品业",
  "化学原料及化学制品制造业",
  "橡胶制品、塑料制品业",
  "通信设备、计算机及其他电子设备制造业",
  "电气机械及器材、线缆制造业",
  "仪器仪表制造业",
  "通用设备和专用设备制造业",
  "工艺品其他制造业",
  "其他（请注明）",
];

const EXPORT_OPTIONS = ["尚未出口", "100万美元以内", "100-500万美元", "500-2000万美元", "2000万美元以上"];

const CERT_OPTIONS = [
  "ISO9001质量管理体系认证",
  "ISO14001环境管理体系认证",
  "ISO45001职业健康安全管理体系认证",
  "SA8000社会责任管理体系",
  "ISO22000 / HACCP 食品安全体系",
  "ISO13485 医疗器械质量体系",
  "IATF16949 汽车行业质量管理",
  "CE认证（欧盟）",
  "MDR认证（欧盟，医疗）",
  "UKCA认证（英国）",
  "UL认证（美国）",
  "FCC认证（美国，无线/电子产品）",
  "FDA认证（美国，医疗/食品）",
  "CPC认证（美国，儿童产品）",
  "PSE认证（日本，电气产品）",
  "MIC/TELEC（日本，无线设备）",
  "KC认证（韩国）",
  "SABER/SASO（沙特）",
  "BIS认证（印度）",
  "EAC认证（俄罗斯/欧亚）",
  "RCM认证（澳大利亚/新西兰）",
  "ISED认证（加拿大，无线设备）",
  "CSA认证（加拿大，电气、建材、医疗）",
  "INMETRO认证（巴西）",
  "TISI认证（泰国）",
  "SNI认证（印尼）",
  "SONCAP认证（尼日利亚）",
  "G-Mark（海湾七国）",
];

const UNGM_OPTIONS = ["未注册", "已注册基础级(Basic)", "已注册一级(Level 1)", "已注册二级(Level 2)"];
const ENGLISH_TEAM_OPTIONS = ["具备且经验丰富", "具备但经验一般", "尚不具备"];
const PAYMENT_OPTIONS = ["可以", "不可以"];
const BID_OPTIONS = ["否", "是"];

// ── 表单类型 ──

interface FormState {
  company_name: string;
  company_website: string;
  founding_year: string;
  employee_count: string;
  industry: string[];
  other_industry: string;
  main_product: string;
  export_scale: string;
  certifications: string[];
  other_certifications: string;
  service_countries: string;
  overseas_companies: string;
  ungm_status: string;
  english_team: string;
  payment_terms: string;
  bid_willingness: string;
  contact_info: string;
}

const INITIAL_FORM: FormState = {
  company_name: "",
  company_website: "",
  founding_year: "",
  employee_count: "",
  industry: [],
  other_industry: "",
  main_product: "",
  export_scale: "",
  certifications: [],
  other_certifications: "",
  service_countries: "",
  overseas_companies: "",
  ungm_status: "",
  english_team: "",
  payment_terms: "",
  bid_willingness: "",
  contact_info: "",
};

// ── 工具组件 ──

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-bold text-slate-700 mb-2">
      {children}
      {required && <span className="text-rose-500 ml-0.5">*</span>}
    </label>
  );
}

/** 按钮式单选组 */
function RadioButtons({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string;
  options: string[];
  onChange: (val: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`rounded-lg border px-3.5 py-2 text-sm font-medium transition-all ${
              active
                ? "border-[#0CAF8C] bg-[#0CAF8C] text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-600 hover:border-[#0CAF8C]/40 hover:bg-[#0CAF8C]/5"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

/** 按钮式多选组 */
function CheckboxButtons({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (val: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-all ${
              active
                ? "border-[#0CAF8C] bg-[#0CAF8C] text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-600 hover:border-[#0CAF8C]/40 hover:bg-[#0CAF8C]/5"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#0CAF8C]/20 focus:border-[#0CAF8C] focus:outline-none transition-all resize-none"
    />
  );
}

// ── 主组件 ──

export default function QualificationFormPage() {
  const { t } = useLocale();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const update = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const toggleIndustry = (val: string) =>
    update(
      "industry",
      form.industry.includes(val) ? form.industry.filter((i) => i !== val) : [...form.industry, val],
    );

  const toggleCert = (val: string) =>
    update(
      "certifications",
      form.certifications.includes(val)
        ? form.certifications.filter((c) => c !== val)
        : [...form.certifications, val],
    );

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
            onClick={() => { setSubmitted(false); setForm(INITIAL_FORM); }}
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
        <div className="space-y-5">
          {/* 卡片容器 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">

            {/* 1. 企业名称 */}
            <div>
              <FieldLabel required>1. {t("qualCompanyName")}：</FieldLabel>
              <TextArea
                value={form.company_name}
                onChange={(v) => update("company_name", v)}
                placeholder={t("qualEnterCompany")}
                rows={2}
              />
            </div>

            {/* 2. 企业官网网址 */}
            <div>
              <FieldLabel required>2. {t("qualCompanyWebsite")}：</FieldLabel>
              <Input
                type="url"
                value={form.company_website}
                onChange={(e) => update("company_website", e.target.value)}
                placeholder="https://"
              />
            </div>

            {/* 3. 企业成立年份 */}
            <div>
              <FieldLabel>3. {t("qualFoundingYear")}：</FieldLabel>
              <Input
                type="text"
                value={form.founding_year}
                onChange={(e) => update("founding_year", e.target.value)}
                placeholder={t("qualEnterYears")}
              />
            </div>

            {/* 4. 企业规模 */}
            <div>
              <FieldLabel>4. {t("qualEmployeeCount")}：</FieldLabel>
              <RadioButtons
                name="employee_count"
                value={form.employee_count}
                options={EMPLOYEE_OPTIONS}
                onChange={(v) => update("employee_count", v)}
              />
            </div>

            {/* 5. 企业所属行业 */}
            <div>
              <FieldLabel required>5. {t("qualIndustry")}：</FieldLabel>
              <CheckboxButtons
                options={INDUSTRY_OPTIONS}
                selected={form.industry}
                onToggle={toggleIndustry}
              />
              {form.industry.includes("其他（请注明）") && (
                <div className="mt-3">
                  <Input
                    type="text"
                    value={form.other_industry}
                    onChange={(e) => update("other_industry", e.target.value)}
                    placeholder={t("qualOtherIndustry")}
                  />
                </div>
              )}
            </div>

            {/* 6. 企业主营产品 */}
            <div>
              <FieldLabel required>6. {t("qualMainProduct")}：</FieldLabel>
              <Input
                type="text"
                value={form.main_product}
                onChange={(e) => update("main_product", e.target.value)}
                placeholder={t("qualEnterProduct")}
              />
            </div>

            {/* 7. 出口/国际业务规模 */}
            <div>
              <FieldLabel required>7. {t("qualExportScale")}：</FieldLabel>
              <RadioButtons
                name="export_scale"
                value={form.export_scale}
                options={EXPORT_OPTIONS}
                onChange={(v) => update("export_scale", v)}
              />
            </div>

            {/* 8. 资质证书 */}
            <div>
              <FieldLabel required>8. {t("qualCertifications")}：</FieldLabel>
              <CheckboxButtons
                options={CERT_OPTIONS}
                selected={form.certifications}
                onToggle={toggleCert}
              />
              <div className="mt-3">
                <Input
                  type="text"
                  value={form.other_certifications}
                  onChange={(e) => update("other_certifications", e.target.value)}
                  placeholder={t("qualOtherCertifications")}
                />
              </div>
            </div>

            {/* 9. 售后点/服务站/维修点 */}
            <div>
              <FieldLabel required>9. {t("qualServiceCountries")}：</FieldLabel>
              <TextArea
                value={form.service_countries}
                onChange={(v) => update("service_countries", v)}
                placeholder={t("qualEnterCountries")}
              />
            </div>

            {/* 10. 海外分公司/投资公司 */}
            <div>
              <FieldLabel required>10. {t("qualOverseasCompanies")}：</FieldLabel>
              <TextArea
                value={form.overseas_companies}
                onChange={(v) => update("overseas_companies", v)}
                placeholder={t("qualEnterCountries")}
              />
            </div>

            {/* 11. UNGM注册状态 */}
            <div>
              <FieldLabel required>11. {t("qualUngmStatus")}：</FieldLabel>
              <RadioButtons
                name="ungm_status"
                value={form.ungm_status}
                options={UNGM_OPTIONS}
                onChange={(v) => update("ungm_status", v)}
              />
            </div>

            {/* 12. 英文团队能力 */}
            <div>
              <FieldLabel required>12. {t("qualEnglishTeam")}：</FieldLabel>
              <RadioButtons
                name="english_team"
                value={form.english_team}
                options={ENGLISH_TEAM_OPTIONS}
                onChange={(v) => update("english_team", v)}
              />
            </div>

            {/* 13. 账期接受度 */}
            <div>
              <FieldLabel required>13. {t("qualPaymentTerms")}：</FieldLabel>
              <RadioButtons
                name="payment_terms"
                value={form.payment_terms}
                options={PAYMENT_OPTIONS}
                onChange={(v) => update("payment_terms", v)}
              />
            </div>

            {/* 14. 投标意愿 */}
            <div>
              <FieldLabel required>14. {t("qualBidWillingness")}：</FieldLabel>
              <RadioButtons
                name="bid_willingness"
                value={form.bid_willingness}
                options={BID_OPTIONS}
                onChange={(v) => update("bid_willingness", v)}
              />
              {form.bid_willingness === "是" && (
                <div className="mt-3 p-3 rounded-lg bg-teal-50 border border-teal-100">
                  <Input
                    type="text"
                    value={form.contact_info}
                    onChange={(e) => update("contact_info", e.target.value)}
                    placeholder={t("qualContactInfo")}
                    className="bg-white"
                  />
                </div>
              )}
            </div>
          </div>

          {/* 提交按钮 */}
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

          <p className="text-center text-xs text-slate-400 pb-4">
            {t("qualAgreeText")}
          </p>
        </div>
      </form>
    </div>
  );
}

QualificationFormPage.displayName = "QualificationFormPage";
