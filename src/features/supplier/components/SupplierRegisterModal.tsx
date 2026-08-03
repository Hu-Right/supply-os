/**
 * 供应商自助入驻弹窗
 * Supplier Self-Registration Modal
 *
 * @module features/supplier/components/SupplierRegisterModal
 * @description 供应商自助入驻表单弹窗，UI 对齐原版 OVERLAY B（label 式表单 +
 *              隐藏默认值 + 行业下拉），提交 POST /api/suppliers。
 *              Supplier self-registration form modal aligned with the original
 *              OVERLAY B (labeled form + hidden defaults + industry select),
 *              submits to POST /api/suppliers.
 */

import { useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useScrollLock } from "@/shared/ui";
import { Input, Select } from "@/shared/ui";
import { registerSupplier, type SupplierRegisterInput } from "../api";
import { emitAppEvent } from "@/core/events";

type SupplierRegisterModalProps = {
  onClose: () => void;
  /** 注册成功后回调（用于刷新列表） */
  onRegistered?: () => void;
};

// 原版表单不展示行业外的地域/合规字段，提交时携带隐藏默认值
const EMPTY_FORM: SupplierRegisterInput = {
  nameZh: "",
  nameEn: "",
  type: "domestic",
  industryZh: "机械",
  countryZh: "中国",
  cityZh: "",
  ungmCode: "",
  mainProductsZh: "",
  complianceLabelsZh: "ISO9001, CE认证",
  contactPerson: "",
  contactEmail: "",
  contactPhone: "",
};

const labelClass = "block text-xs font-extrabold text-slate-700 mb-1";

export function SupplierRegisterModal({ onClose, onRegistered }: SupplierRegisterModalProps) {
  const { t } = useLocale();
  // 弹窗打开期间锁定背景滚动
  useScrollLock();
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
    if (
      !form.nameZh.trim() ||
      !form.contactPerson.trim() ||
      !form.contactEmail.trim() ||
      !form.mainProductsZh.trim()
    ) {
      setError(t("formError"));
      return;
    }

    setSubmitting(true);
    try {
      await registerSupplier(form);
      setSubmitted(true);
      onRegistered?.();
      // 对齐原版 fetchData()：通知 CRM 模块刷新线索池与自定义供应商
      emitAppEvent("supply-os:crm-refresh");
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
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200">
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
          <div>
            <h3 className="text-base font-extrabold">{t("supplierRegTitle")}</h3>
            <p className="text-[10px] text-slate-400">{t("supplierRegDesc")}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h4 className="text-base font-bold text-slate-800">{t("formSuccess")}</h4>
            <p className="text-xs text-slate-500">
              {t("supplierRegSuccessBefore")}
              <strong>pending</strong>
              {t("supplierRegSuccessAfter")}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>{t("supplierRegNameZhLabel")}</label>
                <Input
                  type="text"
                  value={form.nameZh}
                  onChange={(e) => setField("nameZh", e.target.value)}
                  placeholder={t("supplierNameZhPlaceholder")}
                  className="px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className={labelClass}>{t("supplierRegNameEnLabel")}</label>
                <Input
                  type="text"
                  value={form.nameEn}
                  onChange={(e) => setField("nameEn", e.target.value)}
                  placeholder={t("supplierNameEnPlaceholder")}
                  className="px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className={labelClass}>{t("supplierRegTypeLabel")}</label>
                <Select
                  value={form.type}
                  onChange={(e) => setField("type", e.target.value as SupplierRegisterInput["type"])}
                  className="px-3 py-1.5 text-xs"
                >
                  <option value="domestic">{t("supplierTypeDomestic")}</option>
                  <option value="international">{t("supplierTypeIntl")}</option>
                </Select>
              </div>

              <div>
                <label className={labelClass}>{t("supplierRegUngmLabel")}</label>
                <Input
                  type="text"
                  value={form.ungmCode}
                  onChange={(e) => setField("ungmCode", e.target.value)}
                  placeholder={t("supplierUnspscPlaceholder")}
                  className="px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className={labelClass}>{t("supplierRegIndustryLabel")}</label>
                <Select
                  value={form.industryZh}
                  onChange={(e) => setField("industryZh", e.target.value)}
                  className="px-3 py-1.5 text-xs"
                >
                  <option value="机械">{t("industryOptionMachinery")}</option>
                  <option value="电子">{t("industryOptionElectronics")}</option>
                  <option value="建材">{t("industryOptionConstruction")}</option>
                  <option value="医疗">{t("industryOptionMedical")}</option>
                  <option value="化工">{t("industryOptionChemical")}</option>
                </Select>
              </div>

              <div>
                <label className={labelClass}>{t("supplierRegContactLabel")}</label>
                <Input
                  type="text"
                  value={form.contactPerson}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      contactPerson: e.target.value,
                      contactPhone: e.target.value,
                    }))
                  }
                  placeholder={t("supplierContactPlaceholder")}
                  className="px-3 py-2 text-xs"
                />
              </div>

              <div className="md:col-span-2">
                <label className={labelClass}>{t("supplierRegEmailLabel")}</label>
                <Input
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => setField("contactEmail", e.target.value)}
                  placeholder={t("supplierRegEmailPlaceholder")}
                  className="px-3 py-2 text-xs"
                />
              </div>

              <div className="md:col-span-2">
                <label className={labelClass}>{t("supplierRegProductsLabel")}</label>
                <Input
                  type="text"
                  value={form.mainProductsZh}
                  onChange={(e) => setField("mainProductsZh", e.target.value)}
                  placeholder={t("supplierProductsPlaceholder")}
                  className="px-3 py-2 text-xs"
                />
              </div>
            </div>

            {error && (
              <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-3">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-200 text-slate-500 rounded-lg text-xs"
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {t("supplierRegSubmitBtn")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

SupplierRegisterModal.displayName = "SupplierRegisterModal";
