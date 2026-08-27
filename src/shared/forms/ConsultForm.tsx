/**
 * 咨询预约表单
 * Consultation Booking Form
 *
 * @module shared/forms/ConsultForm
 * @description 全局咨询预约弹窗，由 layout-shell 通过 supply-os:consult 事件唤起。
 *              提交后写入 CRM 线索（type: consulting_advisor），成功页 2.2 秒后自动关闭。
 *              使用 FormModal 外壳消除深色头部 + submitted 切换样板代码。
 */

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { FormModal, Button } from "@/shared/ui";
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
    <FormModal
      open
      onClose={onClose}
      title={t("consultTitle")}
      submitted={submitted}
      successView={
        <div className="space-y-3">
          <CheckCircle2 className="w-10 h-10 text-teal-600 mx-auto" />
          <h4 className="text-sm font-bold text-slate-800">{t("consultBookedTitle")}</h4>
          <p className="text-xs text-slate-500">{t("consultBookedDesc")}</p>
        </div>
      }
    >
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
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" variant="dark" size="sm" loading={submitting}>
            {t("consultSubmitBtn")}
          </Button>
        </div>
      </form>
    </FormModal>
  );
}
