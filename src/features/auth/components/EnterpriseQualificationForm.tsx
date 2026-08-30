/**
 * EnterpriseQualificationForm - 企业全球采购机会诊断表单（纯信息收集）
 * 嵌入注册流程的企业注册环节，仅收集信息，由父组件统一提交。
 *
 * @module features/auth/components/EnterpriseQualificationForm
 * @description 14 字段渲染委托给 shared/forms/QualificationFormFields，
 *              本组件仅负责嵌入式容器与 onFormChange 回调。
 */
import { useState, useEffect, useRef, useMemo } from "react";
import { useLocale } from "@/core/i18n";
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

interface EnterpriseQualificationFormProps {
  /** 表单数据变化回调，父组件通过此回调收集信息 */
  onFormChange?: (data: QualificationFormState) => void;
  /** 注册流程传入的手机号，自动同步到 contact_info 避免重复输入 */
  registrationPhone?: string;
}

export default function EnterpriseQualificationForm({ onFormChange, registrationPhone }: EnterpriseQualificationFormProps) {
  const { t } = useLocale();
  const [form, setForm] = useState<QualificationFormState>(() => ({
    ...INITIAL_QUALIFICATION_FORM,
    bid_willingness: "是",
  }));

  // 注册手机号同步到 contact_info（投标意愿默认"是"，手机号共享自注册表单）
  const lastSyncedPhone = useRef("");
  useEffect(() => {
    if (registrationPhone && registrationPhone !== lastSyncedPhone.current) {
      lastSyncedPhone.current = registrationPhone;
      setForm((prev) => ({ ...prev, contact_info: registrationPhone }));
    }
  }, [registrationPhone]);

  useEffect(() => {
    onFormChange?.(form);
  }, [form, onFormChange]);

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

  // eqf* 翻译 key 映射
  const label = (key: QualFieldKey) => {
    const map: Record<QualFieldKey, string> = {
      companyName: t("eqfCompanyName"),
      companyWebsite: t("eqfCompanyWebsite"),
      foundingYear: t("eqfFoundingYear"),
      employeeCount: t("eqfEmployeeCount"),
      industry: t("eqfIndustry"),
      mainProduct: t("eqfMainProduct"),
      exportScale: t("eqfExportScale"),
      certifications: t("eqfCertifications"),
      serviceCountries: t("eqfServiceCountries"),
      overseasCompanies: t("eqfOverseasCompanies"),
      ungmStatus: t("eqfUngmStatus"),
      englishTeam: t("eqfEnglishTeam"),
      paymentTerms: t("eqfPaymentTerms"),
      bidWillingness: t("eqfBidWillingness"),
    };
    return map[key];
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-extrabold text-slate-900">{t("eqfTitle")}</h4>
        </div>
        <QualificationFormFields
          form={form}
          update={update}
          toggleIndustry={toggleIndustry}
          toggleCert={toggleCert}
          label={label}
          placeholder={(key: string) => t(key)}
          options={options}
          hideFields={["bidWillingness"]}
          className="space-y-4"
        />
      </div>
    </div>
  );
}
