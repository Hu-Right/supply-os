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

import { Button, Badge, DataState, type BadgeVariant } from "@/shared/ui";
import { useLocale } from "@/core/i18n";
import { currencySymbol } from "@/shared/utils/format";
import {
  fetchBuyerQuotes, awardRfqQuote, unawardRfqQuote,
  awardDemandQuote, unawardDemandQuote, type QuoteRow,
} from "@/core/api/rfqQuotes";

export interface QuotesPanelProps {
  /** 投影行 id：报价读取/资格仍按它（过渡期） */
  rfqId: number;
  /** 需求 id：定标/撤销走 v2 接口（带授标理由与需求状态流转） */
  demandId?: number;
}

/** 2026-10-31 徽章统一：值改 shared Badge 变体（submitted/rejected→中性，won→primary） */
const STATUS_BADGE: Record<string, { labelKey: string; variant: BadgeVariant }> = {
  submitted: { labelKey: "rfqStatusPending", variant: "soft-neutral" },
  won: { labelKey: "rfqStatusWon", variant: "soft-info" },
  rejected: { labelKey: "rfqStatusRejected", variant: "soft-neutral" },
};

export function QuotesPanel({ rfqId, demandId }: QuotesPanelProps) {
  const { t } = useLocale();
  const [rows, setRows] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [awarding, setAwarding] = useState<number | null>(null);
  const [sealed, setSealed] = useState(false);
  const [sealedCount, setSealedCount] = useState(0);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetchBuyerQuotes(rfqId);
      setRows(res.items);
      setSealed(res.sealed);
      setSealedCount(res.count);
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
      if (demandId) {
        const reason = window.prompt("请填写选定理由（不少于 5 个字，写入审计）", "");
        if (!reason || reason.trim().length < 5) {
          toast.error("请填写不少于 5 个字的选定理由");
          return;
        }
        await awardDemandQuote(demandId, quoteId, reason.trim());
      } else {
        await awardRfqQuote(rfqId, quoteId);
      }
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
      if (demandId) {
        await unawardDemandQuote(demandId);
      } else {
        await unawardRfqQuote(rfqId);
      }
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
      <DataState
        loading={loading}
        error={err || null}
        onRetry={() => void reload()}
        errorText={err}
        retryText={t("rfqQuotesRetry")}
        skeleton={<p className="text-sm text-secondary-400 py-6 text-center" aria-busy="true">{t("rfqQuotesLoading")}</p>}
        isEmpty={!loading && !err && rows.length === 0 && !sealed}
        empty={<p className="text-sm text-secondary-400 py-6 text-center">{t("rfqQuotesEmpty")}</p>}
      >
        <>
      {!loading && !err && sealed && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          报价截止后才可查看明细（已收到 {sealedCount} 条报价）
        </div>
      )}      {!loading && !err && hasWinner && (
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
      {!loading && !err && !sealed && rows.length > 0 && (
        <div className="divide-y divide-secondary-100">
          {rows.map((q, idx) => {
            const badge = STATUS_BADGE[q.status];
            const badgeLabel = badge ? t(badge.labelKey) : q.status;
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
                    <Badge shape="pill" variant={badge?.variant ?? "default"}>{badgeLabel}</Badge>
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
        </>
      </DataState>
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
