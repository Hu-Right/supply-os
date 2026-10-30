/**
 * RFQ 报价汇总 / 比价 / 选定面板（采购方视角）
 *
 * @module features/rfq/components/QuotesPanel
 * @description 仅创建者可见（由父级 isOwner 控制）。拉取该 RFQ 全部有效报价（密封比价），
 *              submitted 报价可「选定中标」（二次确认），选定后本面板刷新展示 won/rejected。
 *              沿用 RFQ 详情页既有中文直写风格。
 */
"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/shared/ui";
import { useLocale } from "@/core/i18n";
import { currencySymbol } from "@/shared/utils/format";
import { fetchBuyerQuotes, awardRfqQuote, unawardRfqQuote, type QuoteRow } from "@/core/api/rfqQuotes";

export interface QuotesPanelProps {
  rfqId: number;
}

const STATUS_BADGE: Record<string, { labelKey: string; cls: string }> = {
  submitted: { labelKey: "rfqStatusPending", cls: "bg-secondary-100 text-secondary-600" },
  won: { labelKey: "rfqStatusWon", cls: "bg-primary-50 text-primary-700" },
  rejected: { labelKey: "rfqStatusRejected", cls: "bg-secondary-100 text-secondary-400" },
};

export function QuotesPanel({ rfqId }: QuotesPanelProps) {
  const { t } = useLocale();
  const [rows, setRows] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [awarding, setAwarding] = useState<number | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      setRows(await fetchBuyerQuotes(rfqId));
    } catch (e) {
      setErr((e as Error).message || t("rfqQuotesLoadFailed"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 保持原依赖（仅 rfqId），语言切换不触发重新拉取
  }, [rfqId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onAward = async (quoteId: number) => {
    if (confirmId !== quoteId) {
      setConfirmId(quoteId);
      return;
    }
    setAwarding(quoteId);
    try {
      await awardRfqQuote(rfqId, quoteId);
      toast.success(t("rfqAwardToast"));
      await reload();
    } catch (e) {
      toast.error((e as Error).message || t("rfqAwardFailed"));
    } finally {
      setConfirmId(null);
      setAwarding(null);
    }
  };

  const onUnaward = async () => {
    if (!confirmRevoke) {
      setConfirmRevoke(true);
      return;
    }
    setRevoking(true);
    try {
      await unawardRfqQuote(rfqId);
      toast.success(t("rfqUnawardToast"));
      await reload();
    } catch (e) {
      toast.error((e as Error).message || t("rfqUnawardFailed"));
    } finally {
      setConfirmRevoke(false);
      setRevoking(false);
    }
  };

  const hasWinner = rows.some((r) => r.status === "won");

  return (
    <Card2 title={t("rfqQuotesPanelTitle")} onRefresh={() => void reload()}>
      {loading && <p className="text-sm text-secondary-400 py-6 text-center">{t("rfqQuotesLoading")}</p>}
      {!loading && err && <p className="text-sm text-danger-500 py-4 text-center">{err}</p>}
      {!loading && !err && rows.length === 0 && (
        <p className="text-sm text-secondary-400 py-6 text-center">{t("rfqQuotesEmpty")}</p>
      )}
      {!loading && !err && hasWinner && (
        <div className="mb-3 flex items-center justify-between rounded-xl bg-primary-50 px-3 py-2">
          <span className="text-xs font-semibold text-primary-700">{t("rfqAwardDone")}</span>
          <Button
            size="sm"
            variant={confirmRevoke ? "danger" : "outline"}
            onClick={() => void onUnaward()}
            disabled={revoking}
          >
            {revoking ? t("rfqUnawarding") : confirmRevoke ? t("rfqUnawardConfirm") : t("rfqUnaward")}
          </Button>
        </div>
      )}
      {!loading && !err && rows.length > 0 && (
        <div className="divide-y divide-secondary-100">
          {rows.map((q, idx) => {
            const badge = STATUS_BADGE[q.status];
            const badgeLabel = badge ? t(badge.labelKey) : q.status;
            const badgeCls = badge ? badge.cls : "bg-secondary-100 text-secondary-600";
            return (
              <div key={q.id} className="py-3 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {idx === 0 && q.status === "submitted" && (
                      <span className="text-[10px] font-bold text-accent-700 bg-accent-100 rounded px-1.5 py-0.5">{t("rfqLowestPrice")}</span>
                    )}
                    <span className="text-sm font-bold text-secondary-800 truncate">
                      {q.company || t("rfqSupplierNo", { id: q.supplierUserId })}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${badgeCls}`}>{badgeLabel}</span>
                  </div>
                  <div className="text-lg font-extrabold text-secondary-900 mt-1">
                    {currencySymbol(q.currency)}{q.price}
                    <span className="text-xs font-normal text-secondary-400 ml-1">{q.currency}</span>
                  </div>
                  <div className="text-xs text-secondary-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {q.leadTimeDays != null && <span>{t("rfqLeadTime", { count: q.leadTimeDays })}</span>}
                    {q.deliveryTerms && <span>{t("rfqTermsLabel", { value: q.deliveryTerms })}</span>}
                    {q.note && <span className="basis-full">{t("rfqNoteLabel", { value: q.note })}</span>}
                  </div>
                </div>
                {q.status === "submitted" && (
                  <Button
                    size="sm"
                    variant={confirmId === q.id ? "primary" : "outline"}
                    onClick={() => void onAward(q.id)}
                    disabled={awarding !== null}
                    className="shrink-0"
                  >
                    {awarding === q.id ? t("rfqSubmitting") : confirmId === q.id ? t("rfqAwardConfirm") : t("rfqAward")}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card2>
  );
}

/** 轻量容器：与详情页卡片同风格（避免依赖 features→app 的反向导入）。 */
function Card2({ title, onRefresh, children }: { title: string; onRefresh: () => void; children: ReactNode }) {
  const { t } = useLocale();
  return (
    <section className="rounded-2xl border border-secondary-200 bg-white p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-extrabold text-secondary-900">{title}</h2>
        <button onClick={onRefresh} className="text-xs text-primary-600 hover:underline">{t("rfqRefresh")}</button>
      </div>
      {children}
    </section>
  );
}
