"use client";

/**
 * 我的报价 — 供应商视角
 * My Quotes (Supplier View)
 *
 * @module app/(public)/rfq/my-quotes/page-client
 * @description 认证供应商查看自己对多条采购需求的报价及中标结果（评审中/已中标/未中标）。
 *              数据来自 GET /api/rfq/my-quotes。需登录；沿用账户页中文直写风格。
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Lock, Trophy } from "lucide-react";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { emitAppEvent } from "@/core/events";
import { Button, EmptyState } from "@/shared/ui";
import { currencySymbol } from "@/shared/utils/format";
import { fetchMyQuotes, withdrawRfqQuote, type MyQuoteRow } from "@/core/api/rfqQuotes";

const QUOTE_BADGE: Record<string, { labelKey: string; cls: string }> = {
  submitted: { labelKey: "rfqQuoteStatusReviewing", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  won: { labelKey: "rfqStatusWon", cls: "bg-teal-50 text-teal-700 border-teal-200" },
  rejected: { labelKey: "rfqQuoteStatusLost", cls: "bg-rose-50 text-rose-600 border-rose-200" },
};

export default function MyQuotesClient() {
  const router = useRouter();
  const { authUser } = useAuth();
  const { t } = useLocale();
  const [rows, setRows] = useState<MyQuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  const reload = useCallback(() => {
    if (!authUser) { setLoading(false); return; }
    setLoading(true);
    setErr("");
    fetchMyQuotes()
      .then((r) => setRows(r))
      .catch((e: Error) => setErr(e?.message || t("rfqLoadFailed")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 保持原依赖（仅 authUser），语言切换不触发重新拉取
  }, [authUser]);

  useEffect(() => { reload(); }, [reload]);

  const handleWithdraw = async (rfqId: number, quoteId: number) => {
    if (!confirm(t("rfqWithdrawConfirm"))) return;
    setBusy(quoteId);
    try {
      await withdrawRfqQuote(rfqId, quoteId);
      reload();
    } catch (e) {
      setErr((e as Error).message || t("rfqWithdrawFailed"));
    } finally {
      setBusy(null);
    }
  };

  if (!authUser) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
        <Lock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-extrabold text-slate-900 mb-2">{t("rfqMyQuotesLoginRequired")}</h3>
        <p className="text-sm text-slate-500 mb-6">{t("rfqMyQuotesLoginDesc")}</p>
        <Button variant="primary" onClick={() => emitAppEvent("supply-os:require-login")}>{t("rfqLoginCta")}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">{t("rfqMyQuotesTitle")}</h2>
          <p className="text-xs text-slate-500 mt-1">{t("rfqMyQuotesCount", { count: rows.length })}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push("/rfq")}>{t("rfqGoPlaza")}</Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-5 animate-pulse">
              <div className="h-5 w-48 bg-slate-100 rounded mb-3" />
              <div className="h-4 w-32 bg-slate-50 rounded" />
            </div>
          ))}
        </div>
      ) : err ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{err}</div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={t("rfqMyQuotesEmptyTitle")}
          description={t("rfqMyQuotesEmptyDesc")}
          action={<Button variant="primary" onClick={() => router.push("/rfq")}>{t("rfqGoPlazaShort")}</Button>}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((q) => {
            const badge = QUOTE_BADGE[q.quoteStatus];
            const badgeLabel = badge ? t(badge.labelKey) : q.quoteStatus;
            const badgeCls = badge ? badge.cls : "bg-slate-100 text-slate-600 border-slate-200";
            return (
              <div key={q.quoteId} className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className={`px-2 py-0.5 rounded border text-2xs font-bold ${badgeCls}`}>
                        {q.quoteStatus === "won" && <Trophy className="w-3 h-3 inline mr-0.5 -mt-0.5" />}
                        {badgeLabel}
                      </span>
                      <span className="text-2xs text-slate-400">{q.reference || `#${q.rfqId}`}</span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 truncate">{q.title}</h3>
                    <div className="mt-2 flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                      <span className="text-slate-900 font-extrabold text-sm">
                        {currencySymbol(q.currency)}{q.price}
                        <span className="text-2xs font-normal text-slate-400 ml-1">{q.currency}</span>
                      </span>
                      {q.leadTimeDays != null && <span>{t("rfqLeadTime", { count: q.leadTimeDays })}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {q.quoteStatus === "submitted" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-rose-600 border-rose-200 hover:bg-rose-50"
                        disabled={busy === q.quoteId}
                        onClick={() => handleWithdraw(q.rfqId, q.quoteId)}
                      >
                        {busy === q.quoteId ? t("rfqWithdrawing") : t("rfqWithdraw")}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="gap-1" onClick={() => router.push(`/rfq/${q.rfqId}`)}>
                      <Eye className="w-3.5 h-3.5" /> {t("rfqViewRfq")}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
