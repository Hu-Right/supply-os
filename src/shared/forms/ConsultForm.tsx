/**
 * 咨询预约表单
 * Consultation Booking Form
 *
 * @module shared/forms/ConsultForm
 * @description 全局咨询预约弹窗，由 App.tsx 通过 supply-os:consult 事件唤起
 *              Global consultation booking modal, triggered by App.tsx via supply-os:consult event
 */

import { useState } from "react";
import { X } from "lucide-react";
import { useLocale } from "@/core/i18n";

export interface ConsultFormProps {
  onClose: () => void;
}

export function ConsultForm({ onClose }: ConsultFormProps) {
  const { t } = useLocale();
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/consult", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setSubmitted(true);
        setTimeout(onClose, 2000);
      } else {
        alert(t("consultSubmitFail"));
      }
    } catch {
      alert(t("consultSubmitFail"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-xs flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 cursor-pointer">
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-extrabold text-slate-900 mb-1">{t("consultFormTitle")}</h2>
        <p className="text-xs text-slate-500 mb-4">{t("consultFormDesc")}</p>

        {submitted ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-sm font-bold text-teal-700">{t("consultSubmitSuccess")}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-600">{t("consultFieldName")}</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-600">{t("consultFieldEmail")}</label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">{t("consultFieldPhone")}</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600">{t("consultFieldMessage")}</label>
              <textarea
                required
                rows={3}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? t("consultSubmitting") : t("consultSubmitBtn")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
