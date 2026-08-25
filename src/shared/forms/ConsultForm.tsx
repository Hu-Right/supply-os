/**
 * 咨询预约表单
 * Consultation Booking Form
 *
 * @module shared/forms/ConsultForm
 * @description 全局咨询预约弹窗，由 App.tsx 通过 supply-os:consult 事件唤起。
 *              提交后写入 CRM 线索（type: consulting_advisor），成功页 2.2 秒后自动关闭。
 *              Global consultation booking modal, triggered by App.tsx via supply-os:consult event.
 *              Submits a CRM lead (type: consulting_advisor); success view auto-closes after 2.2s.
 */

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, X } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Modal } from "@/shared/ui";
import { api } from "@/core/http";

export interface ConsultFormProps {
  onClose: () => void;
}

export function ConsultForm({ onClose }: ConsultFormProps) {
  const { t } = useLocale();
  const [form, setForm] = useState({ companyName: "", contactPerson: "", phone: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api<{ success: boolean }>("/api/leads", {
        method: "POST",
        body: {
          companyName: form.companyName,
          contactPerson: form.contactPerson,
          contactMethod: form.phone,
          notes: `[咨询顾问申请] ${form.notes}`,
          type: "consulting_advisor",
          industry: "Services",
        } as unknown as BodyInit,
      });
      setSubmitted(true);
      // 对齐远端：成功页停留 2.2 秒后自动关闭
      window.setTimeout(onClose, 2200);
    } catch {
      toast.error(t("consultSubmitFail"));
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    "w-full px-3 py-1.5 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500";

  return (
    <Modal open onClose={onClose} showClose={false}>
      {/* 深色 Header（保持原始视觉风格） */}
      <div className="bg-slate-900 text-white px-5 py-4 flex justify-between items-center -mx-4 md:-mx-6 -mt-4 md:-mt-6 mb-4 md:mb-6 rounded-t-2xl">
        <h3 className="text-sm font-extrabold">{t("consultTitle")}</h3>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      {submitted ? (
        <div className="p-8 text-center space-y-3">
          <CheckCircle2 className="w-10 h-10 text-teal-600 mx-auto" />
          <h4 className="text-sm font-bold text-slate-800">{t("consultBookedTitle")}</h4>
          <p className="text-xs text-slate-500">{t("consultBookedDesc")}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">{t("formConsultCompany")}</label>
            <input
              type="text"
              required
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              placeholder={t("consultCompanyPlaceholder")}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">{t("consultFormContactName")}</label>
            <input
              type="text"
              required
              value={form.contactPerson}
              onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
              placeholder={t("consultPersonPlaceholder")}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">{t("consultFormPhone")}</label>
            <input
              type="text"
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder={t("consultPhonePlaceholder")}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">{t("formConsultNeeds")}</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder={t("consultNotesPlaceholder")}
              className={inputCls}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 border border-slate-200 text-slate-400 rounded text-xs cursor-pointer"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 bg-slate-900 text-white rounded text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
            >
              {t("consultSubmitBtn")}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
