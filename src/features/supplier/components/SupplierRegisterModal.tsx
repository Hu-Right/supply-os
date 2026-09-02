/**
 * 供应商注册弹窗（企业全球采购机会诊断 — 弹窗版）
 * Supplier Registration Modal (Enterprise Diagnosis — Modal Variant)
 *
 * @module features/supplier/components/SupplierRegisterModal
 * @description 供应商管理页"注册成为全球采购供应商"按钮弹出的信息收集弹窗。
 *              14 字段渲染委托给 shared/forms/QualificationFormFields，
 *              提交逻辑与入库路径与企业全球采购机会诊断完全一致：
 *              POST /api/supplier-qualification → crm_supplier_qualification 表。
 */

import { useState, useMemo, useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "@/core/i18n";
import { FormModal, Button } from "@/shared/ui";
import { submitSupplierQualification } from "@/features/procurement/api/qualification";
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
import { emitAppEvent } from "@/core/events";

type SupplierRegisterModalProps = {
  onClose: () => void;
  onRegistered?: () => void;
};

export function SupplierRegisterModal({ onClose, onRegistered }: SupplierRegisterModalProps) {
  const { t } = useLocale();
  const [form, setForm] = useState<QualificationFormState>(INITIAL_QUALIFICATION_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
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

  const handleSubmit = async () => {
    // ── 校验（与 QualificationFormPage 一致） ──
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
        ...(refCode ? { invitation_code: refCode } : {}),
      });
      toast.success(t("qualSuccessTitle"));
      setSubmitted(true);
      onRegistered?.();
      emitAppEvent("supply-os:crm-refresh");
      setTimeout(() => onClose(), 3000);
    } catch (err) {
      toast.error(err instanceof ApiError && err.message ? err.message : t("qualErrorNetwork"));
    } finally {
      setLoading(false);
    }
  };

  // qual* 翻译 key 映射（与 QualificationFormPage 一致）
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

  return (
    <FormModal
      open
      onClose={onClose}
      className="max-w-3xl"
      title={t("supplierRegTitle")}
      subtitle={t("supplierRegDesc")}
      submitted={submitted}
      successView={
        <div className="space-y-4">
          <div className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h4 className="text-base font-bold text-slate-800">{t("qualSuccessTitle")}</h4>
          <p className="text-xs text-slate-500">{t("qualSuccessDesc")}</p>
        </div>
      }
      bodyClassName="max-h-[65vh] overflow-y-auto"
      footer={
        !submitted && (
          <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="button" variant="dark" loading={loading} onClick={handleSubmit}>
              {t("supplierRegSubmitBtn")}
            </Button>
          </div>
        )
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
        <QualificationFormFields
          form={form}
          update={update}
          toggleIndustry={toggleIndustry}
          toggleCert={toggleCert}
          label={label}
          placeholder={(key: string) => t(key)}
          options={options}
          className="space-y-5"
        />
      </form>
    </FormModal>
  );
}

SupplierRegisterModal.displayName = "SupplierRegisterModal";
