/**
 * RFQ 报价弹窗
 *
 * @module features/rfq/components/QuoteDialog
 * @description 认证供应商对某条已发布 RFQ 提交/更新报价。资格与截止由后端闸口把关，
 *              失败以服务端 message 展示。沿用详情页既有中文直写风格（该页不走 t()）。
 */
"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/ui";
import { submitRfqQuote } from "@/core/api/rfqQuotes";

export interface QuoteDialogProps {
  open: boolean;
  rfqId: number;
  defaultCurrency: string;
  onClose: () => void;
  onSuccess?: (quoteId: number) => void;
}

export function QuoteDialog({ open, rfqId, defaultCurrency, onClose, onSuccess }: QuoteDialogProps) {
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

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const onSubmit = async () => {
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) {
      setErr("请填写有效的报价金额（正数）");
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
      toast.success("报价已提交");
      onSuccess?.(quoteId);
      onClose();
    } catch (e) {
      setErr((e as Error).message || "提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-secondary-200 px-3 py-2 text-sm text-secondary-800 focus:outline-none focus:ring-2 focus:ring-primary-500/40";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md rounded-2xl bg-white shadow-xl border border-secondary-200"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-secondary-100">
          <h3 className="text-base font-extrabold text-secondary-900">提交报价</h3>
          <button onClick={onClose} aria-label="关闭" className="p-1.5 rounded-lg text-secondary-400 hover:bg-secondary-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-secondary-500 mb-1">报价金额 *</label>
              <input
                type="number" inputMode="decimal" value={price}
                onChange={(e) => setPrice(e.target.value)} placeholder="例如 128000" className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-secondary-500 mb-1">币种</label>
              <input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={10} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-secondary-500 mb-1">交付周期（天）</label>
            <input
              type="number" inputMode="numeric" value={leadDays}
              onChange={(e) => setLeadDays(e.target.value)} placeholder="可选" className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-secondary-500 mb-1">交付/商务条款</label>
            <input value={terms} onChange={(e) => setTerms(e.target.value)} maxLength={200} placeholder="可选" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-secondary-500 mb-1">报价说明</label>
            <textarea
              value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3}
              placeholder="可选" className={inputCls}
            />
          </div>
          {err && <p className="text-xs text-danger-500">{err}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-secondary-100">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>取消</Button>
          <Button size="sm" onClick={() => void onSubmit()} disabled={submitting}>
            {submitting ? "提交中…" : "提交报价"}
          </Button>
        </div>
      </div>
    </div>
  );
}
