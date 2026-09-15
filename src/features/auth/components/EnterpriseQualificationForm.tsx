/**
 * EnterpriseQualificationForm - 企业全球采购机会诊断表单（纯信息收集）
 * 嵌入注册流程的企业注册环节，仅收集信息，由父组件统一提交。
 *
 * @module features/auth/components/EnterpriseQualificationForm
 * @description 14 字段渲染委托给 shared/forms/QualificationFormFields，
 *              本组件仅负责嵌入式容器与 onFormChange 回调。
 */
import { useEffect, useRef, useMemo, useCallback } from "react";
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
import { usePersistedFormState } from "@/shared/hooks/usePersistedFormState";
import { DRAFT_TTL_MS } from "../hooks/useAuthForm";

interface EnterpriseQualificationFormProps {
  /** 表单数据变化回调，父组件通过此回调收集信息 */
  onFormChange?: (data: QualificationFormState) => void;
  /** 注册流程传入的手机号，自动同步到 contact_info 避免重复输入 */
  registrationPhone?: string;
}

export default function EnterpriseQualificationForm({ onFormChange, registrationPhone }: EnterpriseQualificationFormProps) {
  const { t } = useLocale();

  // ★ 草稿持久化：弹窗意外关闭/页面刷新后重新打开可自动恢复诊断数据
  const [form, setForm, clearDraft] = usePersistedFormState<QualificationFormState>(
    "draft:auth_qualification",
    { ...INITIAL_QUALIFICATION_FORM, bid_willingness: "是" },
    { ttlMs: DRAFT_TTL_MS },
  );

  // ★ 挂载时将恢复的草稿数据同步给父组件（用于提交时透传诊断数据）
  // 使用 ref 持有回调，effect 仅依赖 form 初始引用，不会因 form 变化反复触发
  const onFormChangeRef = useRef(onFormChange);
  onFormChangeRef.current = onFormChange;
  useEffect(() => {
    onFormChangeRef.current?.(form);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 注册手机号同步到 contact_info（投标意愿默认"是"，手机号共享自注册表单）
  const lastSyncedPhone = useRef(registrationPhone);
  useEffect(() => {
    if (registrationPhone && registrationPhone !== lastSyncedPhone.current) {
      lastSyncedPhone.current = registrationPhone;
      const next = { ...form, contact_info: registrationPhone };
      setForm(next);
      onFormChange?.(next);
    }
  }, [registrationPhone]);

  // ★ 修复：删除原 useEffect(() => { onFormChange?.(form); }, [form, onFormChange])
  // 原代码每次 form state 变化都回调父组件，导致每输入一个字符就触发
  // EnterpriseQualificationForm → RegisterForm → LoginRegisterForm 级联重渲染，
  // 移动端表现为焦点丢失、表单闪烁甚至弹窗意外关闭。
  // 改为在用户实际操作的 update / toggle 函数中直接调用 onFormChange。

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

  // ★ 用户操作时才通知父组件，避免 useEffect 监听 form 导致的级联重渲染
  const update = useCallback(<K extends keyof QualificationFormState>(key: K, val: QualificationFormState[K]) => {
    const next = { ...form, [key]: val };
    setForm(next);
    onFormChange?.(next);
  }, [form, onFormChange]);

  const toggleIndustry = useCallback((val: string) => {
    const next = { ...form, industry: form.industry.includes(val) ? form.industry.filter((i) => i !== val) : [...form.industry, val] };
    setForm(next);
    onFormChange?.(next);
  }, [form, onFormChange]);

  const toggleCert = useCallback((val: string) => {
    const next = { ...form, certifications: form.certifications.includes(val) ? form.certifications.filter((c) => c !== val) : [...form.certifications, val] };
    setForm(next);
    onFormChange?.(next);
  }, [form, onFormChange]);

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
