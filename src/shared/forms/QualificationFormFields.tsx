/**
 * 企业资质诊断表单 — 14 字段共享核心
 * Enterprise Qualification Diagnosis Form — Shared 14-field Core
 *
 * @module shared/forms/QualificationFormFields
 * @description 三份企业资质表单（公采资质测试 / 研修班诊断 / 注册流程嵌入）
 *              共享的 14 字段渲染逻辑。各消费方仅负责外壳布局、提交逻辑与成功页。
 *              D4-1 拆分：类型/常量提取至 qualification-form-types.ts。
 */

import { Input, Textarea } from "@/shared/ui";
import type { QualOption } from "@/shared/data/qualificationOptions";
// D4-1 拆分：类型与常量从 qualification-form-types 导入，re-export 保持向后兼容
import { QUAL_FIELDS, PLACEHOLDER_KEYS } from "./qualification-form-types";
import type { QualificationFormFieldsProps } from "./qualification-form-types";
export type {
  QualificationFormState, QualFieldKey, QualificationFormFieldsProps,
} from "./qualification-form-types";
export { INITIAL_QUALIFICATION_FORM, QUAL_FIELDS } from "./qualification-form-types";

// ── 内部工具组件 ──

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-bold text-slate-700 mb-2">
      {children}
      {required && <span className="text-rose-500 ml-0.5">*</span>}
    </label>
  );
}

function RadioButtons({ value, options, onChange }: {
  value: string;
  options: QualOption[];
  onChange: (val: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-lg border px-3.5 py-2 text-sm font-medium transition-all ${
              active
                ? "border-training-green bg-training-green text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-600 hover:border-training-green/40 hover:bg-training-green/5"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function CheckboxButtons({ options, selected, onToggle }: {
  options: QualOption[];
  selected: string[];
  onToggle: (val: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onToggle(opt.value)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-all ${
              active
                ? "border-training-green bg-training-green text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-600 hover:border-training-green/40 hover:bg-training-green/5"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function FormTextArea({ value, onChange, placeholder, rows = 3 }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:ring-2 focus:ring-training-green/20 focus:border-training-green focus:outline-none transition-all resize-none"
    />
  );
}

// ── 主组件 ──

export function QualificationFormFields({
  form,
  update,
  toggleIndustry,
  toggleCert,
  label,
  placeholder,
  options,
  className = "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6",
  hideFields,
}: QualificationFormFieldsProps) {
  const ph = placeholder ?? ((key: string) => key);
  const hidden = new Set(hideFields);

  return (
    <div className={className}>
      {/* 1. 企业名称 */}
      <div>
        <FieldLabel required>{QUAL_FIELDS[0].no}. {label("companyName")}：</FieldLabel>
        <Input
          value={form.company_name}
          onChange={(e) => update("company_name", e.target.value)}
          placeholder={ph(PLACEHOLDER_KEYS.companyName)}
        />
      </div>

      {/* 2. 企业官网 */}
      <div>
        <FieldLabel>{QUAL_FIELDS[1].no}. {label("companyWebsite")}：</FieldLabel>
        <Input
          type="text"
          value={form.company_website}
          onChange={(e) => update("company_website", e.target.value)}
          placeholder={ph("qualCompanyWebsitePlaceholder")}
        />
      </div>

      {/* 3. 成立年份 */}
      <div>
        <FieldLabel>{QUAL_FIELDS[2].no}. {label("foundingYear")}：</FieldLabel>
        <Input
          type="text"
          value={form.founding_year}
          onChange={(e) => update("founding_year", e.target.value)}
          placeholder={ph(PLACEHOLDER_KEYS.foundingYear)}
        />
      </div>

      {/* 4. 员工规模 */}
      <div>
        <FieldLabel>{QUAL_FIELDS[3].no}. {label("employeeCount")}：</FieldLabel>
        <RadioButtons
          value={form.employee_count}
          options={options.employee}
          onChange={(v) => update("employee_count", v)}
        />
      </div>

      {/* 5. 所属行业 */}
      <div>
        <FieldLabel required>{QUAL_FIELDS[4].no}. {label("industry")}：</FieldLabel>
        <CheckboxButtons
          options={options.industry}
          selected={form.industry}
          onToggle={toggleIndustry}
        />
        {form.industry.includes("其他（请注明）") && (
          <div className="mt-3">
            <Input
              type="text"
              value={form.other_industry}
              onChange={(e) => update("other_industry", e.target.value)}
              placeholder={ph(PLACEHOLDER_KEYS.otherIndustry)}
            />
          </div>
        )}
      </div>

      {/* 6. 主营产品 */}
      <div>
        <FieldLabel required>{QUAL_FIELDS[5].no}. {label("mainProduct")}：</FieldLabel>
        <Input
          type="text"
          value={form.main_product}
          onChange={(e) => update("main_product", e.target.value)}
          placeholder={ph(PLACEHOLDER_KEYS.mainProduct)}
        />
      </div>

      {/* 7. 出口规模 */}
      <div>
        <FieldLabel required>{QUAL_FIELDS[6].no}. {label("exportScale")}：</FieldLabel>
        <RadioButtons
          value={form.export_scale}
          options={options.exportScale}
          onChange={(v) => update("export_scale", v)}
        />
      </div>

      {/* 8. 资质证书 */}
      <div>
        <FieldLabel required>{QUAL_FIELDS[7].no}. {label("certifications")}：</FieldLabel>
        <CheckboxButtons
          options={options.cert}
          selected={form.certifications}
          onToggle={toggleCert}
        />
        <div className="mt-3">
          <Input
            type="text"
            value={form.other_certifications}
            onChange={(e) => update("other_certifications", e.target.value)}
            placeholder={ph(PLACEHOLDER_KEYS.otherCertifications)}
          />
        </div>
      </div>

      {/* 9. 服务国家 */}
      <div>
        <FieldLabel required>{QUAL_FIELDS[8].no}. {label("serviceCountries")}：</FieldLabel>
        <FormTextArea
          value={form.service_countries}
          onChange={(v) => update("service_countries", v)}
          placeholder={ph(PLACEHOLDER_KEYS.serviceCountries)}
        />
      </div>

      {/* 10. 海外分公司 */}
      <div>
        <FieldLabel required>{QUAL_FIELDS[9].no}. {label("overseasCompanies")}：</FieldLabel>
        <FormTextArea
          value={form.overseas_companies}
          onChange={(v) => update("overseas_companies", v)}
          placeholder={ph(PLACEHOLDER_KEYS.overseasCompanies)}
        />
      </div>

      {/* 11. UNGM 注册状态 */}
      <div>
        <FieldLabel required>{QUAL_FIELDS[10].no}. {label("ungmStatus")}：</FieldLabel>
        <RadioButtons
          value={form.ungm_status}
          options={options.ungm}
          onChange={(v) => update("ungm_status", v)}
        />
      </div>

      {/* 12. 英文团队能力 */}
      <div>
        <FieldLabel required>{QUAL_FIELDS[11].no}. {label("englishTeam")}：</FieldLabel>
        <RadioButtons
          value={form.english_team}
          options={options.englishTeam}
          onChange={(v) => update("english_team", v)}
        />
      </div>

      {/* 13. 账期接受度 */}
      <div>
        <FieldLabel required>{QUAL_FIELDS[12].no}. {label("paymentTerms")}：</FieldLabel>
        <RadioButtons
          value={form.payment_terms}
          options={options.payment}
          onChange={(v) => update("payment_terms", v)}
        />
      </div>

      {/* 14. 投标意愿 */}
      {!hidden.has("bidWillingness") && (
      <div>
        <FieldLabel required>{QUAL_FIELDS[13].no}. {label("bidWillingness")}：</FieldLabel>
        <RadioButtons
          value={form.bid_willingness}
          options={options.bid}
          onChange={(v) => update("bid_willingness", v)}
        />
        {form.bid_willingness === "是" && (
          <div className="mt-3 p-3 rounded-lg bg-teal-50 border border-teal-100">
            <Input
              type="text"
              value={form.contact_info}
              onChange={(e) => update("contact_info", e.target.value)}
              placeholder={ph(PLACEHOLDER_KEYS.contactInfo)}
              className="bg-white"
            />
          </div>
        )}
      </div>
      )}
    </div>
  );
}
