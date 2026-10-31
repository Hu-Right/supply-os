/**
 * RFQ 报价弹窗
 *
 * @module features/rfq/components/QuoteDialog
 * @description 认证供应商对某条已发布 RFQ 提交/更新报价。资格与截止由后端闸口把关，
 *              失败以服务端 message 展示。沿用详情页既有中文直写风格（该页不走 t()）。
 */
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button, Modal } from "@/shared/ui";
import { useLocale } from "@/core/i18n";
import { submitRfqQuote } from "@/core/api/rfqQuotes";

export interface QuoteDialogProps {
  open: boolean;
  rfqId: number;
  defaultCurrency: string;
  onClose: () => void;
  onSuccess?: (quoteId: number) => void;
}

export function QuoteDialog({ open, rfqId, defaultCurrency, onClose, onSuccess }: QuoteDialogProps) {
  const { t } = useLocale();
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency || "CNY");
  const [leadDays, setLeadDays] = useState("");
  const [terms, setTerms] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  // 每次打开重置表单，避免残留
  useEffect(() => {
    if (open) {
      setPrice("");
      setCurrency(defaultCurrency || "CNY");
      setLeadDays("");
      setTerms("");
      setNote("");
      setErr("");
      setSubmitting(false);
    }
  }, [open, defaultCurrency]);

  const onSubmit = async () => {
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) {
      setErr(t("rfqQuoteErrInvalidPrice"));
      return;
    }
    setSubmitting(true);
    setErr("");
    try {
      const { quoteId } = await submitRfqQuote(rfqId, {
        price: p,
        currency: currency || "CNY",
        lead_time_days: leadDays.trim() === "" ? null : Number(leadDays),
        delivery_terms: terms.trim() === "" ? null : terms.trim(),
        note: note.trim() === "" ? null : note.trim(),
      });
      toast.success(t("rfqQuoteSubmitted"));
      onSuccess?.(quoteId);
      onClose();
    } catch (e) {
      setErr((e as Error).message || t("rfqQuoteSubmitFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-secondary-200 px-3 py-2 text-sm text-secondary-800 focus:outline-none focus:ring-2 focus:ring-primary-500/40";

  // 2026-10-31 组件化：手写 fixed 遮罩换 shared Modal（Radix Dialog）——
  // 白得 Esc/遮罩关闭、焦点圈定（focus trap）与移动端拖拽关闭，原手写 Esc effect 一并删除
  return (
    <Modal open={open} onClose={onClose} title={t("rfqQuoteSubmit")} className="max-w-md p-0">
      <>
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-secondary-500 mb-1">{t("rfqQuotePriceLabel")}</label>
              <input
                type="number" inputMode="decimal" value={price}
                onChange={(e) => setPrice(e.target.value)} placeholder={t("rfqQuotePricePlaceholder")} className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-secondary-500 mb-1">{t("rfqQuoteCurrencyLabel")}</label>
              <input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={10} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-secondary-500 mb-1">{t("rfqQuoteLeadTimeLabel")}</label>
            <input
              type="number" inputMode="numeric" value={leadDays}
              onChange={(e) => setLeadDays(e.target.value)} placeholder={t("rfqOptional")} className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-secondary-500 mb-1">{t("rfqQuoteTermsLabel")}</label>
            <input value={terms} onChange={(e) => setTerms(e.target.value)} maxLength={200} placeholder={t("rfqOptional")} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-secondary-500 mb-1">{t("rfqQuoteNoteLabel")}</label>
            <textarea
              value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3}
              placeholder={t("rfqOptional")} className={inputCls}
            />
          </div>
          {err && <p className="text-xs text-danger-500">{err}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-secondary-100">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>{t("rfqCancel")}</Button>
          <Button size="sm" onClick={() => void onSubmit()} disabled={submitting}>
            {submitting ? t("rfqSubmitting") : t("rfqQuoteSubmit")}
          </Button>
        </div>
      </>
    </Modal>
  );
}
