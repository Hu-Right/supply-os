"use client";

/**
 * RFQ 需求详情（v2）
 * @module app/(public)/rfq/[id]
 *
 * @description 读 `/api/rfq/demands/{id}`：
 *              - 公开需求：报价窗口内任何人可见；
 *              - 定向需求：非受邀者只拿到摘要（`restricted=true`），页面给出说明；
 *              - 采购方本人：看到内部状态、驳回理由与报价汇总。
 *              供应商侧报价/邀约/选定仍以搜索投影行（`noticePk`）为准（过渡期桥接）。
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Building2, CalendarClock, Globe2, Hash, Landmark,
  MapPin, ShieldCheck, Truck, Wallet,
} from "lucide-react";

import { api } from "@/core/http";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { Button, Card } from "@/shared/ui";
import { DEMAND_STATUS } from "@/shared/constants/rfq-demand";
import { QuoteDialog } from "@/features/rfq/components/QuoteDialog";
import { QuotesPanel } from "@/features/rfq/components/QuotesPanel";
import { InvitePanel } from "@/features/rfq/components/InvitePanel";
import { statusMeta } from "@/features/rfq/model/status";
import { formatBudget, formatCloseCountdown, formatYmd, formatYmdHm } from "@/features/rfq/model/format";

const EVENT_LABEL_KEY: Record<string, string> = {
  created: "rfqDetailEventCreated",
  submitted: "rfqDetailEventSubmitted",
  claimed: "rfqDetailEventClaimed",
  published: "rfqDetailEventPublished",
  rejected: "rfqDetailEventRejected",
  edited: "rfqDetailEventEdited",
  closed: "rfqDetailEventClosed",
  evaluation_started: "rfqDetailEventEvaluationStarted",
  awarded: "rfqDetailEventAwarded",
};

interface DemandEventItem {
  id: number;
  type: string;
  actor: string;
  fromStatus: string | null;
  toStatus: string | null;
  at: number;
  payload: Record<string, unknown> | null;
}

/** 时间线：直接渲染事件流（谁、何时、从什么到什么、为什么） */
function Timeline({ demandId }: { demandId: number }) {
  const { t } = useLocale();
  const [items, setItems] = useState<DemandEventItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ items: DemandEventItem[] }>(`/api/rfq/demands/${demandId}/events`)
      .then((res) => setItems(Array.isArray(res.items) ? res.items : []))
      .catch((e: Error) => setError(e.message || t("rfqLoadFailed")));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅需求切换时拉取，语言切换不重新请求
  }, [demandId]);

  return (
    <Card className="rounded-2xl p-6">
      <h2 className="text-sm font-extrabold text-secondary-900 mb-4">{t("rfqDetailTimelineTitle")}</h2>
      {error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-secondary-400">{t("rfqDetailTimelineEmpty")}</p>
      ) : (
        <ol className="space-y-3">
          {items.map((e) => {
            const reason = e.payload && typeof e.payload.reason === "string" ? e.payload.reason : "";
            const labelKey = EVENT_LABEL_KEY[e.type];
            return (
              <li key={e.id} className="flex gap-3 text-xs">
                <span className="w-32 shrink-0 text-secondary-400">{formatYmdHm(e.at)}</span>
                <span className="shrink-0 font-bold text-secondary-700">{labelKey ? t(labelKey) : e.type}</span>
                <span className="text-secondary-500">
                  {e.actor === "reviewer"
                    ? t("rfqDetailActorReviewer")
                    : e.actor === "system"
                      ? t("rfqDetailActorSystem")
                      : t("rfqDetailActorBuyer")}
                  {e.fromStatus && e.toStatus ? ` · ${e.fromStatus} → ${e.toStatus}` : ""}
                  {reason ? ` · ${reason}` : ""}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

interface DemandDetail {
  id: number;
  reference: string;
  title: string;
  description: string;
  status: string;
  revision: number;
  categoryCode: string;
  categoryL1: string;
  categoryL2: string;
  province: string;
  purchaseType: string;
  quantity: number | null;
  quantityUnit: string;
  budgetAmount: number | null;
  budgetConfidential: boolean;
  currency: string;
  incoterm: string;
  deliveryTime: string;
  deliveryAddress: string;
  paymentTerms: string[];
  supplierReqs: string[];
  visibility: string;
  closeAt: number | null;
  publishedDate: string | null;
  rejectReason: string;
  closeReason: string;
  isOwner: boolean;
  restricted: boolean;
  noticePk: number | null;
}

function TermItem({ icon: Icon, label, value }: {
  icon: typeof Truck; label: string; value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl p-3 bg-secondary-50/60">
      <div className="w-8 h-8 rounded-lg bg-white border border-secondary-100 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-primary-600" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-secondary-400">{label}</p>
        <p className="text-sm font-semibold text-secondary-800 break-words mt-0.5">{value || "—"}</p>
      </div>
    </div>
  );
}

interface QaItem {
  id: number;
  question: string;
  answer: string;
  askedByMe: boolean;
  answeredAt: number | null;
  createdAt: number | null;
}

/** 答疑：公开提问 + 统一答复；采购方可逐条答复 */
function QaSection({ demandId, isOwner, canAsk }: { demandId: number; isOwner: boolean; canAsk: boolean }) {
  const { t } = useLocale();
  const [items, setItems] = useState<QaItem[]>([]);
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    api<{ items: QaItem[] }>(`/api/rfq/demands/${demandId}/qa`)
      .then((res) => setItems(Array.isArray(res.items) ? res.items : []))
      .catch((e: Error) => setError(e.message || t("rfqLoadFailed")));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅需求切换时重载，语言切换不重新请求
  useEffect(load, [demandId]);

  const submitQuestion = async () => {
    if (question.trim().length < 10) { setError(t("rfqDetailQaQuestionTooShort")); return; }
    setBusy(true);
    setError("");
    try {
      await api(`/api/rfq/demands/${demandId}/qa`, { method: "POST", body: { question: question.trim() } });
      setQuestion("");
      load();
    } catch (e) {
      setError((e as Error).message || t("rfqDetailQaSubmitFailed"));
    } finally {
      setBusy(false);
    }
  };

  const submitAnswer = async (qaId: number) => {
    const answer = (answers[qaId] ?? "").trim();
    if (!answer) { setError(t("rfqDetailQaAnswerRequired")); return; }
    setBusy(true);
    setError("");
    try {
      await api(`/api/rfq/demands/${demandId}/qa/${qaId}/answer`, { method: "POST", body: { answer } });
      setAnswers((prev) => ({ ...prev, [qaId]: "" }));
      load();
    } catch (e) {
      setError((e as Error).message || t("rfqDetailQaAnswerFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (!isOwner && !canAsk && items.length === 0) return null;

  return (
    <Card className="rounded-2xl p-6">
      <h2 className="text-sm font-extrabold text-secondary-900 mb-4">{t("rfqDetailQaTitle")}</h2>
      {items.length === 0 ? (
        <p className="text-xs text-secondary-400">{t("rfqDetailQaEmpty")}</p>
      ) : (
        <ul className="space-y-4">
          {items.map((q) => (
            <li key={q.id} className="rounded-xl border border-secondary-100 p-3">
              <p className="text-xs text-secondary-500">
                {q.askedByMe ? t("rfqDetailQaAskedByMe") : t("rfqDetailQaAskedBySupplier")} · {formatYmd(q.createdAt ?? undefined)}
              </p>
              <p className="mt-1 text-sm text-secondary-800 whitespace-pre-wrap">{q.question}</p>
              {q.answer ? (
                <div className="mt-2 rounded-lg bg-secondary-50 p-3">
                  <p className="text-2xs font-bold text-secondary-500">{t("rfqDetailQaBuyerAnswer")}</p>
                  <p className="mt-1 text-sm text-secondary-700 whitespace-pre-wrap">{q.answer}</p>
                </div>
              ) : isOwner ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    className="w-full rounded-lg border border-secondary-200 p-2 text-sm"
                    rows={2}
                    placeholder={t("rfqDetailQaAnswerPlaceholder")}
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  />
                  <Button size="sm" disabled={busy} onClick={() => void submitAnswer(q.id)}>{t("rfqDetailQaSubmitAnswer")}</Button>
                </div>
              ) : (
                <p className="mt-2 text-2xs text-secondary-400">{t("rfqDetailQaPendingAnswer")}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {canAsk && (
        <div className="mt-4 space-y-2">
          <textarea
            className="w-full rounded-lg border border-secondary-200 p-2 text-sm"
            rows={2}
            placeholder={t("rfqDetailQaQuestionPlaceholder")}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <Button size="sm" disabled={busy} onClick={() => void submitQuestion()}>{t("rfqDetailQaSubmitQuestion")}</Button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
    </Card>
  );
}

export default function RfqDetailPageClient() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { t } = useLocale();
  const [detail, setDetail] = useState<DemandDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const { authUser } = useAuth();
  const [quoteOpen, setQuoteOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api<DemandDetail>(`/api/rfq/demands/${id}`)
      .then((res) => setDetail(res))
      .catch((err: Error) => setError(err.message || t("rfqLoadFailed")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅需求切换时拉取，语言切换不重新请求
  }, [id]);

  if (loading) {
    return <div className="py-16 text-center text-sm text-secondary-400">{t("rfqLoading")}</div>;
  }

  if (error || !detail) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-sm text-secondary-500">{error || t("rfqNotFound")}</p>
        <Button variant="outline" size="sm" onClick={() => window.history.back()}>{t("rfqBack")}</Button>
      </div>
    );
  }

  const meta = statusMeta(detail.status, detail.closeReason);
  const closed = detail.status === DEMAND_STATUS.CLOSED;
  const openForQuoting =
    detail.status === DEMAND_STATUS.PUBLISHED &&
    (detail.closeAt == null || detail.closeAt > Date.now() / 1000);
  const canQuote = openForQuoting && !detail.isOwner && !!detail.noticePk && !detail.restricted && !!authUser;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card className="rounded-2xl p-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className={`px-2.5 py-1 rounded-full border text-xs font-bold ${meta.tone}`}>
            {t(meta.labelKey)}
          </span>
          {detail.categoryL1 && (
            <span className="px-2.5 py-1 rounded-full bg-secondary-100 text-secondary-600 text-xs font-semibold">
              {detail.categoryL1}{detail.categoryL2 ? ` / ${detail.categoryL2}` : ""}
            </span>
          )}
          {detail.visibility === "targeted" && (
            <span className="px-2.5 py-1 rounded-full bg-secondary-100 text-secondary-600 text-xs font-semibold">
              {t("rfqVisibilityTargeted")}
            </span>
          )}
        </div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-secondary-900 leading-snug">
          {detail.title}
        </h1>
        <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-secondary-400">
          {detail.reference && (
            <span className="flex items-center gap-1">
              <Hash className="w-3.5 h-3.5" /> {t("rfqDetailReference", { reference: detail.reference })}
            </span>
          )}
          {detail.closeAt && (
            <span className="flex items-center gap-1">
              <CalendarClock className="w-3.5 h-3.5" />
              {t("rfqDetailDeadlineCountdown", {
                date: formatYmd(detail.closeAt),
                remain: formatCloseCountdown(detail.closeAt, undefined, t),
              })}
            </span>
          )}
          {detail.province && (
            <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{detail.province}</span>
          )}
        </div>
      </Card>

      {detail.restricted ? (
        <Card className="rounded-2xl p-8 text-center">
          <ShieldCheck className="w-10 h-10 text-secondary-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-secondary-800">{t("rfqDetailRestrictedTitle")}</p>
          <p className="mt-1 text-xs text-secondary-500">
            {t("rfqDetailRestrictedDesc")}
          </p>
        </Card>
      ) : (
        <>
          {canQuote && (
            <Card className="rounded-2xl p-5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-bold text-secondary-800">{t("rfqQuoteEntryTitle")}</p>
                <p className="text-xs text-secondary-400 mt-0.5">
                  {t("rfqDetailSealedHint")}
                </p>
              </div>
              <Button size="sm" onClick={() => setQuoteOpen(true)} className="shrink-0">{t("rfqQuoteNow")}</Button>
            </Card>
          )}

          {detail.isOwner && detail.status === DEMAND_STATUS.PUBLISHED && detail.noticePk && (
            <InvitePanel rfqId={detail.noticePk} visibility={detail.visibility} />
          )}

          {detail.isOwner && detail.noticePk && (
            <QuotesPanel rfqId={detail.noticePk} demandId={detail.id} />
          )}

          <Card className="rounded-2xl p-6">
            <h2 className="text-sm font-extrabold text-secondary-900 mb-4">{t("rfqTermsSection")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TermItem icon={Wallet} label={t("rfqTermBudget")} value={formatBudget(detail.budgetAmount, detail.currency, detail.budgetConfidential, t)} />
              <TermItem icon={Truck} label={t("rfqTermIncoterm")} value={detail.incoterm} />
              <TermItem icon={CalendarClock} label={t("rfqTermDeliveryTime")} value={detail.deliveryTime} />
              <TermItem icon={MapPin} label={t("rfqFieldAddress")} value={detail.deliveryAddress || detail.province} />
              <TermItem icon={Landmark} label={t("rfqFieldPayment")} value={detail.paymentTerms.join(t("rfqEnumSep"))} />
              <TermItem icon={Globe2} label={t("rfqFieldVisibility")} value={detail.visibility === "public" ? t("rfqVisibilityPublic") : t("rfqVisibilityTargeted")} />
            </div>
            {(detail.quantity != null || detail.quantityUnit) && (
              <p className="mt-3 text-xs text-secondary-500">
                {t("rfqDetailQuantity", { qty: detail.quantity ?? "—", unit: detail.quantityUnit })}
              </p>
            )}
            {detail.supplierReqs.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-secondary-400 mb-2 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> {t("rfqSupplierReqsLabel")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {detail.supplierReqs.map((req) => (
                    <span key={req} className="px-2.5 py-1 rounded-lg bg-secondary-100 text-secondary-600 text-xs font-semibold">
                      {req}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="rounded-2xl p-6">
            <h2 className="text-sm font-extrabold text-secondary-900 mb-4 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary-600" /> {t("rfqFieldDescription")}
            </h2>
            <p className="text-sm text-secondary-700 leading-7 whitespace-pre-wrap">{detail.description}</p>
          </Card>

          {detail.isOwner && detail.rejectReason && (
            <Card className="rounded-2xl p-5 border border-rose-100 bg-rose-50">
              <p className="text-sm font-bold text-rose-700">{t("rfqDetailRejectReason")}</p>
              <p className="mt-1 text-xs text-rose-600">{detail.rejectReason}</p>
            </Card>
          )}

          <QaSection
            demandId={detail.id}
            isOwner={detail.isOwner}
            canAsk={
              !!authUser &&
              !detail.isOwner &&
              detail.status === DEMAND_STATUS.PUBLISHED &&
              (detail.closeAt == null || detail.closeAt > Date.now() / 1000)
            }
          />

          {detail.isOwner && <Timeline demandId={detail.id} />}

          {closed && (
            <Card className="rounded-2xl p-5 text-center text-xs text-secondary-500">
              {t("rfqDetailClosedNotice", { reason: t(meta.labelKey) })}
            </Card>
          )}
        </>
      )}

      {detail.noticePk && (
        <QuoteDialog
          open={quoteOpen}
          rfqId={detail.noticePk}
          defaultCurrency={detail.currency}
          onClose={() => setQuoteOpen(false)}
        />
      )}
    </div>
  );
}
