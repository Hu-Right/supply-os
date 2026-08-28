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

// ── 选项常量（与 QualificationFormPage 保持一致）──

const EMPLOYEE_OPTIONS = ["50人以下", "50-200人", "200-500人", "500人以上"];
const INDUSTRY_OPTIONS = [
  "农林牧渔业", "食品加工与食品、饮料制造业", "纺织业、化学纤维制造业",
  "服装、鞋帽、皮革制造业", "木材加工及木、竹、藤、棕、草制品、家具制造业",
  "纸制品、印刷业、文教体育、办公用品制造业",
  "非金属矿物制品业（含水泥、玻璃、陶瓷、耐火材料等）",
  "金属制品业", "化学原料及化学制品制造业", "橡胶制品、塑料制品业",
  "通信设备、计算机及其他电子设备制造业", "电气机械及器材、线缆制造业",
  "仪器仪表制造业", "通用设备和专用设备制造业",
  "工艺品其他制造业", "其他（请注明）",
];
const EXPORT_OPTIONS = ["尚未出口", "100万美元以内", "100-500万美元", "500-2000万美元", "2000万美元以上"];
const CERT_OPTIONS = [
  "ISO9001质量管理体系认证", "ISO14001环境管理体系认证", "ISO45001职业健康安全管理体系认证",
  "SA8000社会责任管理体系", "ISO22000 / HACCP 食品安全体系", "ISO13485 医疗器械质量体系",
  "IATF16949 汽车行业质量管理", "CE认证（欧盟）", "MDR认证（欧盟，医疗）",
  "UKCA认证（英国）", "UL认证（美国）", "FCC认证（美国，无线/电子产品）",
  "FDA认证（美国，医疗/食品）", "CPC认证（美国，儿童产品）",
  "PSE认证（日本，电气产品）", "MIC/TELEC（日本，无线设备）",
  "KC认证（韩国）", "SABER/SASO（沙特）", "BIS认证（印度）",
  "EAC认证（俄罗斯/欧亚）", "RCM认证（澳大利亚/新西兰）",
  "ISED认证（加拿大，无线设备）", "CSA认证（加拿大，电气、建材、医疗）",
  "INMETRO认证（巴西）", "TISI认证（泰国）", "SNI认证（印尼）",
  "SONCAP认证（尼日利亚）", "G-Mark（海湾七国）",
];
const UNGM_OPTIONS = ["未注册", "已注册基础级(Basic)", "已注册一级(Level 1)", "已注册二级(Level 2)"];
const ENGLISH_TEAM_OPTIONS = ["具备且经验丰富", "具备但经验一般", "尚不具备"];
const PAYMENT_OPTIONS = ["可以", "不可以"];
const BID_OPTIONS = ["否", "是"];

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
  name: string; value: string; options: string[]; onChange: (val: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button key={opt} type="button" onClick={() => onChange(opt)}
            className={`rounded-lg border px-3.5 py-2 text-sm font-medium transition-all ${
              active ? "border-[#0CAF8C] bg-[#0CAF8C] text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-600 hover:border-[#0CAF8C]/40 hover:bg-[#0CAF8C]/5"
            }`}>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function CheckboxButtons({ options, selected, onToggle }: {
  options: string[]; selected: string[]; onToggle: (val: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button key={opt} type="button" onClick={() => onToggle(opt)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-all ${
              active ? "border-[#0CAF8C] bg-[#0CAF8C] text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-600 hover:border-[#0CAF8C]/40 hover:bg-[#0CAF8C]/5"
            }`}>
            {opt}
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

  const update = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));
  const toggleIndustry = (val: string) =>
    update("industry", form.industry.includes(val) ? form.industry.filter((i) => i !== val) : [...form.industry, val]);
  const toggleCert = (val: string) =>
    update("certifications", form.certifications.includes(val) ? form.certifications.filter((c) => c !== val) : [...form.certifications, val]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.company_name.trim()) return setError(t("eqfCompanyNameRequired") || "请填写企业名称");
    if (!form.company_website.trim()) return setError(t("eqfCompanyWebsiteRequired") || "请填写企业官网");
    if (form.industry.length === 0) return setError(t("eqfIndustryRequired") || "请选择所属行业");
    if (!form.main_product.trim()) return setError(t("eqfMainProductRequired") || "请填写主营产品");
    if (!form.export_scale) return setError(t("eqfExportScaleRequired") || "请选择出口规模");
    if (form.certifications.length === 0) return setError(t("eqfCertRequired") || "请选择资质证书");
    if (!form.service_countries.trim()) return setError(t("eqfServiceCountriesRequired") || "请填写服务国家");
    if (!form.overseas_companies.trim()) return setError(t("eqfOverseasRequired") || "请填写海外分公司信息");
    if (!form.ungm_status) return setError(t("eqfUngmRequired") || "请选择UNGM状态");
    if (!form.english_team) return setError(t("eqfEnglishRequired") || "请选择英文团队能力");
    if (!form.payment_terms) return setError(t("eqfPaymentRequired") || "请选择账期接受度");
    if (!form.bid_willingness) return setError(t("eqfBidRequired") || "请选择投标意愿");

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
      setError(err instanceof ApiError && err.message ? err.message : (t("eqfSubmitError") || "提交失败，请稍后重试"));
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
        <h3 className="text-base font-bold text-teal-800">
          {t("eqfSuccessTitle") || "诊断问卷已提交"}
        </h3>
        <p className="text-sm text-teal-700 leading-relaxed">
          {t("eqfSuccessDesc") || "添加我们的客服微信，获取专属诊断报告"}
        </p>
        <div className="flex justify-center">
          <img
            src="/wechat-service-qr.png"
            alt="客服微信二维码"
            className="w-40 h-40 rounded-xl border-2 border-white shadow-md"
          />
        </div>
        <p className="text-xs text-teal-600">
          {t("eqfSuccessHint") || "微信扫码添加客服，发送「诊断报告」即可获取"}
        </p>
        <button
          type="button"
          onClick={onSuccess}
          className="inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold text-white transition-colors bg-[#0CAF8C] hover:bg-[#099a7a]"
        >
          <Send className="w-4 h-4" />
          {t("eqfCompleteRegister") || "完成注册"}
        </button>
      </div>
    );
  }

  // ── 表单 ─
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-extrabold text-slate-900">
            {t("eqfTitle") || "企业全球采购机会诊断"}
          </h4>
          <span className="text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-1">
            {t("eqfBadge") || "必填"}
          </span>
        </div>

        {/* 1. 企业名称 */}
        <div>
          <FieldLabel required>1. {t("eqfCompanyName") || "企业名称"}：</FieldLabel>
          <TextArea value={form.company_name} onChange={(v) => update("company_name", v)}
            placeholder={t("eqfEnterCompany") || "请输入企业全称"} rows={2} />
        </div>

        {/* 2. 企业官网 */}
        <div>
          <FieldLabel required>2. {t("eqfCompanyWebsite") || "企业官网"}：</FieldLabel>
          <Input type="url" value={form.company_website}
            onChange={(e) => update("company_website", e.target.value)} placeholder="https://" />
        </div>

        {/* 3. 成立年份 */}
        <div>
          <FieldLabel>3. {t("eqfFoundingYear") || "成立年份"}：</FieldLabel>
          <Input type="text" value={form.founding_year}
            onChange={(e) => update("founding_year", e.target.value)} placeholder={t("eqfEnterYears") || "如：2010"} />
        </div>

        {/* 4. 员工规模 */}
        <div>
          <FieldLabel>4. {t("eqfEmployeeCount") || "员工规模"}：</FieldLabel>
          <RadioButtons name="employee_count" value={form.employee_count}
            options={EMPLOYEE_OPTIONS} onChange={(v) => update("employee_count", v)} />
        </div>

        {/* 5. 所属行业 */}
        <div>
          <FieldLabel required>5. {t("eqfIndustry") || "所属行业"}：</FieldLabel>
          <CheckboxButtons options={INDUSTRY_OPTIONS} selected={form.industry} onToggle={toggleIndustry} />
          {form.industry.includes("其他（请注明）") && (
            <div className="mt-3">
              <Input type="text" value={form.other_industry}
                onChange={(e) => update("other_industry", e.target.value)}
                placeholder={t("eqfOtherIndustry") || "请注明其他行业"} />
            </div>
          )}
        </div>

        {/* 6. 主营产品 */}
        <div>
          <FieldLabel required>6. {t("eqfMainProduct") || "主营产品"}：</FieldLabel>
          <Input type="text" value={form.main_product}
            onChange={(e) => update("main_product", e.target.value)}
            placeholder={t("eqfEnterProduct") || "请输入主营产品"} />
        </div>

        {/* 7. 出口规模 */}
        <div>
          <FieldLabel required>7. {t("eqfExportScale") || "出口/国际业务规模"}：</FieldLabel>
          <RadioButtons name="export_scale" value={form.export_scale}
            options={EXPORT_OPTIONS} onChange={(v) => update("export_scale", v)} />
        </div>

        {/* 8. 资质证书 */}
        <div>
          <FieldLabel required>8. {t("eqfCertifications") || "资质证书"}：</FieldLabel>
          <CheckboxButtons options={CERT_OPTIONS} selected={form.certifications} onToggle={toggleCert} />
          <div className="mt-3">
            <Input type="text" value={form.other_certifications}
              onChange={(e) => update("other_certifications", e.target.value)}
              placeholder={t("eqfOtherCertifications") || "其他资质证书（选填）"} />
          </div>
        </div>

        {/* 9. 服务国家 */}
        <div>
          <FieldLabel required>9. {t("eqfServiceCountries") || "售后点/服务站/维修点覆盖国家"}：</FieldLabel>
          <TextArea value={form.service_countries} onChange={(v) => update("service_countries", v)}
            placeholder={t("eqfEnterCountries") || "请输入覆盖的国家/地区"} />
        </div>

        {/* 10. 海外分公司 */}
        <div>
          <FieldLabel required>10. {t("eqfOverseasCompanies") || "海外分公司/投资公司"}：</FieldLabel>
          <TextArea value={form.overseas_companies} onChange={(v) => update("overseas_companies", v)}
            placeholder={t("eqfEnterCountries") || "请输入海外分公司信息"} />
        </div>

        {/* 11. UNGM状态 */}
        <div>
          <FieldLabel required>11. {t("eqfUngmStatus") || "UNGM注册状态"}：</FieldLabel>
          <RadioButtons name="ungm_status" value={form.ungm_status}
            options={UNGM_OPTIONS} onChange={(v) => update("ungm_status", v)} />
        </div>

        {/* 12. 英文团队 */}
        <div>
          <FieldLabel required>12. {t("eqfEnglishTeam") || "英文团队能力"}：</FieldLabel>
          <RadioButtons name="english_team" value={form.english_team}
            options={ENGLISH_TEAM_OPTIONS} onChange={(v) => update("english_team", v)} />
        </div>

        {/* 13. 账期 */}
        <div>
          <FieldLabel required>13. {t("eqfPaymentTerms") || "是否接受账期付款"}：</FieldLabel>
          <RadioButtons name="payment_terms" value={form.payment_terms}
            options={PAYMENT_OPTIONS} onChange={(v) => update("payment_terms", v)} />
        </div>

        {/* 14. 投标意愿 */}
        <div>
          <FieldLabel required>14. {t("eqfBidWillingness") || "是否有意参与国际投标"}：</FieldLabel>
          <RadioButtons name="bid_willingness" value={form.bid_willingness}
            options={BID_OPTIONS} onChange={(v) => update("bid_willingness", v)} />
          {form.bid_willingness === "是" && (
            <div className="mt-3 p-3 rounded-lg bg-teal-50 border border-teal-100">
              <Input type="text" value={form.contact_info}
                onChange={(e) => update("contact_info", e.target.value)}
                placeholder={t("eqfContactInfo") || "请留下联系方式（手机/微信/邮箱）"}
                className="bg-white" />
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-3">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white shadow-md disabled:opacity-60 disabled:cursor-not-allowed transition-all bg-[#0CAF8C] hover:bg-[#099a7a]"
      >
        <Send className="w-4 h-4" />
        {loading ? (t("eqfSubmitting") || "提交中...") : (t("eqfSubmitBtn") || "提交诊断问卷")}
      </button>
    </form>
  );
}
