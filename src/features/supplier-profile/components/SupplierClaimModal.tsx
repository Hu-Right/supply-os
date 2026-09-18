/**
 * 供应商认领弹窗
 * Supplier Claim Modal
 *
 * @module features/supplier-profile/components/SupplierClaimModal
 * @description 用户在供应商详情页点击"认领该企业"后弹出，
 *              填写联系方式后提交到 POST /api/supplier-claims。
 */
import { useState } from "react";
import { X } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { api } from "@/core/http";

interface SupplierClaimModalProps {
  supplierId: number;
  companyName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function SupplierClaimModal({ supplierId, companyName, onClose, onSuccess }: SupplierClaimModalProps) {
  const { t } = useLocale();
  const [form, setForm] = useState({
    contactName: "",
    contactPhone: "",
    position: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!form.contactName.trim()) {
      setError("请填写联系人姓名");
      return;
    }
    if (!form.contactPhone.trim() || !/^1[3-9]\d{9}$/.test(form.contactPhone.trim())) {
      setError("请填写有效的手机号");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await api("/api/supplier-claims", {
        method: "POST",
        body: {
          supplier_id: supplierId,
          company_name: companyName,
          contact_name: form.contactName.trim(),
          contact_phone: form.contactPhone.trim(),
        },
      });
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const field = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-400 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">
            {success ? "提交成功" : "认领该企业"}
          </h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-100">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {success ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-teal-50 border border-teal-200 px-4 py-3 text-sm text-teal-700">
              认领申请已提交，我们将尽快审核。审核通过后，该企业将绑定到您的账号。
            </div>
            <p className="text-xs text-slate-500">企业：{companyName}</p>
          </div>
        ) : (
          <>
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600">
              <p className="font-medium text-slate-800">{companyName}</p>
              <p className="text-xs text-slate-500 mt-1">
                填写您的联系方式，提交认领申请。审核通过后，该企业将绑定到您的账号。
              </p>
            </div>

            {/* 联系人姓名 */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                联系人姓名 <span className="text-rose-500">*</span>
              </label>
              <input
                className={field}
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                placeholder="请输入您的姓名"
                maxLength={100}
              />
            </div>

            {/* 手机号 */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                手机号 <span className="text-rose-500">*</span>
              </label>
              <input
                className={field}
                type="tel"
                inputMode="tel"
                value={form.contactPhone}
                onChange={(e) => setForm({ ...form, contactPhone: e.target.value.replace(/\D/g, "").slice(0, 11) })}
                placeholder="请输入手机号"
                maxLength={11}
              />
            </div>

            {/* 职位（选填） */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">职位</label>
              <input
                className={field}
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                placeholder="请输入您的职位（选填）"
                maxLength={100}
              />
            </div>

            {error && (
              <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-3">
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? "提交中…" : "提交认领申请"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-100 transition-colors"
              >
                取消
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
