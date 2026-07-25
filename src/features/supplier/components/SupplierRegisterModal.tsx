/**
 * 供应商自助入驻弹窗
 * Supplier Self-Registration Modal
 *
 * @module features/supplier/components/SupplierRegisterModal
 * @description 供应商自助入驻表单弹窗，字段对齐远端并提交 POST /api/suppliers
 *              Supplier self-registration form modal, fields aligned with the
 *              remote implementation, submits to POST /api/suppliers.
 */

import { useState } from "react";
import { CheckCircle2, Store, X } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { registerSupplier, type SupplierRegisterInput } from "../api";

type SupplierRegisterModalProps = {
  onClose: () => void;
  /** 注册成功后回调（用于刷新列表） */
  onRegistered?: () => void;
};

const EMPTY_FORM: SupplierRegisterInput = {
  nameZh: "",
  nameEn: "",
  type: "domestic",
  industryZh: "",
  countryZh: "",
  cityZh: "",
  ungmCode: "",
  mainProductsZh: "",
  complianceLabelsZh: "",
  contactPerson: "",
  contactEmail: "",
  contactPhone: "",
};

const inputClass =
  "w-full px-3 py-2.5 text-sm bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500";

export function SupplierRegisterModal({ onClose, onRegistered }: SupplierRegisterModalProps) {
  const { t } = useLocale();
  const [form, setForm] = useState<SupplierRegisterInput>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const setField = <K extends keyof SupplierRegisterInput>(key: K, value: SupplierRegisterInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // 必填校验以受控状态为准（浏览器自动填充下 DOM el.value 可能为空串）。
    if (!form.nameZh.trim() || !form.contactPerson.trim() || !form.contactEmail.trim()) {
      setError(t("formError"));
      return;
    }

    setSubmitting(true);
    try {
      await registerSupplier(form);
      setSubmitted(true);
      onRegistered?.();
      // 成功态展示 3 秒后自动关闭
      setTimeout(() => {
        onClose();
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("formError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-xs flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200">
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex justify-between items-start">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[10px] font-black text-teal-300 bg-teal-400/10 border border-teal-400/20 rounded-full px-2 py-1 mb-2">
              <Store className="w-3.5 h-3.5" />
              {t("supplierRegSubmitBtn")}
            </div>
            <h3 className="text-lg font-extrabold">{t("supplierRegTitle")}</h3>
            <p className="text-xs text-slate-400 mt-1">{t("supplierRegDesc")}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto max-h-[calc(90vh-88px)]">
          {submitted ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <CheckCircle2 className="w-12 h-12 text-teal-500" />
              <p className="text-sm font-bold text-teal-700 bg-teal-50 border border-teal-100 rounded-lg px-4 py-3">
                {t("supplierRegSuccess")}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={form.nameZh}
                  onChange={(e) => setField("nameZh", e.target.value)}
                  placeholder={t("supplierNameZhPlaceholder")}
                  className={inputClass}
                />
                <input
                  type="text"
                  value={form.nameEn}
                  onChange={(e) => setField("nameEn", e.target.value)}
                  placeholder={t("supplierNameEnPlaceholder")}
                  className={inputClass}
                />
                <select
                  value={form.type}
                  onChange={(e) => setField("type", e.target.value as SupplierRegisterInput["type"])}
                  className={inputClass}
                >
                  <option value="domestic">{t("supplierTypeDomestic")}</option>
                  <option value="international">{t("supplierTypeIntl")}</option>
                </select>
                <input
                  type="text"
                  value={form.industryZh}
                  onChange={(e) => setField("industryZh", e.target.value)}
                  placeholder={t("supplierIndustryPlaceholder")}
                  className={inputClass}
                />
                <input
                  type="text"
                  value={form.countryZh}
                  onChange={(e) => setField("countryZh", e.target.value)}
                  placeholder={t("supplierCountryPlaceholder")}
                  className={inputClass}
                />
                <input
                  type="text"
                  value={form.cityZh}
                  onChange={(e) => setField("cityZh", e.target.value)}
                  placeholder={t("supplierCityPlaceholder")}
                  className={inputClass}
                />
                <input
                  type="text"
                  value={form.ungmCode}
                  onChange={(e) => setField("ungmCode", e.target.value)}
                  placeholder={t("supplierUnspscPlaceholder")}
                  className="sm:col-span-2 px-3 py-2.5 text-sm bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
                <input
                  type="text"
                  value={form.mainProductsZh}
                  onChange={(e) => setField("mainProductsZh", e.target.value)}
                  placeholder={t("supplierProductsPlaceholder")}
                  className="sm:col-span-2 px-3 py-2.5 text-sm bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
                <input
                  type="text"
                  value={form.complianceLabelsZh}
                  onChange={(e) => setField("complianceLabelsZh", e.target.value)}
                  placeholder={t("supplierCompliancePlaceholder")}
                  className="sm:col-span-2 px-3 py-2.5 text-sm bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
                <input
                  type="text"
                  value={form.contactPerson}
                  onChange={(e) => setField("contactPerson", e.target.value)}
                  placeholder={t("supplierContactPlaceholder")}
                  className={inputClass}
                />
                <input
                  type="text"
                  value={form.contactPhone}
                  onChange={(e) => setField("contactPhone", e.target.value)}
                  placeholder={t("supplierContactPhonePlaceholder")}
                  className={inputClass}
                />
                <input
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => setField("contactEmail", e.target.value)}
                  placeholder={t("supplierContactEmailPlaceholder")}
                  className="sm:col-span-2 px-3 py-2.5 text-sm bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>

              {error && (
                <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-3">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-black hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {t("supplierRegSubmitBtn")}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

SupplierRegisterModal.displayName = "SupplierRegisterModal";
