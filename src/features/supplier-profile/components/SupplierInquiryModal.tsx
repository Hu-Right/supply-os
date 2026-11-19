"use client";

/**
 * 供应商询盘弹窗
 *
 * @module features/supplier-profile/components/SupplierInquiryModal
 * @description 非 VIP 也可提交采购需求：只收需求描述 + 可选数量/联系方式，提交到
 *              POST /api/suppliers/[id]/inquiry，由平台/企业跟进；不暴露供应商联系方式。
 */
import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { api, mapApiError } from "@/core/http";
import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import { Button, Modal } from "@/shared/ui";

export interface SupplierInquiryModalProps {
  /** 供应商路由 id（`sup-db-123` 或纯数字，服务端 parseSupplierId 两种都认） */
  supplierId: string;
  supplierName: string;
  onClose: () => void;
}

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-teal-400 focus:ring-2 focus:ring-teal-100";

export function SupplierInquiryModal({ supplierId, supplierName, onClose }: SupplierInquiryModalProps) {
  const { t, locale } = useLocale();
  const { authUser } = useAuth();
  const [demand, setDemand] = useState("");
  const [quantity, setQuantity] = useState("");
  const [contactName, setContactName] = useState(authUser?.nickname ?? "");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState(authUser?.email ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (demand.trim().length < 10) {
      setError(t("inquiryNeedRequired"));
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api(`/api/suppliers/${encodeURIComponent(supplierId)}/inquiry`, {
        method: "POST",
        body: {
          demand: demand.trim(),
          quantity: quantity.trim() || undefined,
          contact_name: contactName.trim() || undefined,
          contact_phone: contactPhone.trim() || undefined,
          contact_email: contactEmail.trim() || undefined,
          locale,
        },
      });
      setDone(true);
    } catch (err) {
      setError(mapApiError(err, t) || t("inquiryFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={t("inquiryTitle", { name: supplierName })}>
      {done ? (
        <div className="space-y-4 py-2">
          <div className="flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-800">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" />
            <div>
              <p className="font-extrabold">{t("inquirySuccessTitle")}</p>
              <p className="mt-1 text-teal-700">{t("inquirySuccessDesc")}</p>
            </div>
          </div>
          <Button type="button" variant="primary" className="w-full py-2.5" onClick={onClose}>
            {t("inquiryClose")}
          </Button>
        </div>
      ) : (
        <form className="space-y-3.5" onSubmit={handleSubmit}>
          <p className="text-sm text-slate-500">{t("inquiryDesc")}</p>

          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-700">{t("inquiryNeedLabel")}</span>
            <textarea
              className={`${INPUT_CLASS} min-h-28 resize-y`}
              value={demand}
              maxLength={2000}
              required
              placeholder={t("inquiryNeedPlaceholder")}
              onChange={(e) => setDemand(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-700">{t("inquiryQuantityLabel")}</span>
            <input
              className={INPUT_CLASS}
              value={quantity}
              maxLength={100}
              placeholder={t("inquiryQuantityPlaceholder")}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-700">{t("inquiryContactNameLabel")}</span>
              <input
                className={INPUT_CLASS}
                value={contactName}
                maxLength={100}
                autoComplete="name"
                onChange={(e) => setContactName(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-700">{t("inquiryContactPhoneLabel")}</span>
              <input
                className={INPUT_CLASS}
                value={contactPhone}
                maxLength={30}
                inputMode="tel"
                autoComplete="tel"
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-700">{t("inquiryContactEmailLabel")}</span>
              <input
                className={INPUT_CLASS}
                value={contactEmail}
                maxLength={200}
                type="email"
                autoComplete="email"
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </label>
          </div>

          <p className="text-2xs text-slate-400">{t("inquiryContactHint")}</p>

          {error && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              {error}
            </p>
          )}

          <Button type="submit" variant="primary" className="w-full gap-2 py-2.5" disabled={submitting}>
            <Send className="h-4 w-4" />
            {submitting ? t("inquirySubmitting") : t("inquirySubmit")}
          </Button>
        </form>
      )}
    </Modal>
  );
}
