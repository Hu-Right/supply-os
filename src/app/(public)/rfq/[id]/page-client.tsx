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
import { Button, Card } from "@/shared/ui";
import { DEMAND_STATUS } from "@/shared/constants/rfq-demand";
import { QuoteDialog } from "@/features/rfq/components/QuoteDialog";
import { QuotesPanel } from "@/features/rfq/components/QuotesPanel";
import { InvitePanel } from "@/features/rfq/components/InvitePanel";
import { statusMeta } from "@/features/rfq/model/status";
import { formatBudget, formatCloseCountdown, formatYmd, formatYmdHm } from "@/features/rfq/model/format";

const EVENT_LABEL: Record<string, string> = {
  created: "创建需求",
  submitted: "提交审核",
  claimed: "审核领取",
  published: "审核通过并发布",
  rejected: "审核退回",
  edited: "编辑内容",
  closed: "结案",
  evaluation_started: "报价截止，进入评审",
  awarded: "选定供应商",
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
  const [items, setItems] = useState<DemandEventItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ items: DemandEventItem[] }>(`/api/rfq/demands/${demandId}/events`)
      .then((res) => setItems(Array.isArray(res.items) ? res.items : []))
      .catch((e: Error) => setError(e.message || "加载失败"));
  }, [demandId]);

  return (
    <Card className="rounded-2xl p-6">
      <h2 className="text-sm font-extrabold text-secondary-900 mb-4">进展记录</h2>
      {error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-secondary-400">暂无记录</p>
      ) : (
        <ol className="space-y-3">
          {items.map((e) => {
            const reason = e.payload && typeof e.payload.reason === "string" ? e.payload.reason : "";
            return (
              <li key={e.id} className="flex gap-3 text-xs">
                <span className="w-32 shrink-0 text-secondary-400">{formatYmdHm(e.at)}</span>
                <span className="shrink-0 font-bold text-secondary-700">{EVENT_LABEL[e.type] ?? e.type}</span>
                <span className="text-secondary-500">
                  {e.actor === "reviewer" ? "平台审核" : e.actor === "system" ? "系统" : "采购方"}
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
  const [items, setItems] = useState<QaItem[]>([]);
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    api<{ items: QaItem[] }>(`/api/rfq/demands/${demandId}/qa`)
      .then((res) => setItems(Array.isArray(res.items) ? res.items : []))
      .catch((e: Error) => setError(e.message || "加载失败"));
  };
  useEffect(load, [demandId]);

  const submitQuestion = async () => {
    if (question.trim().length < 10) { setError("问题至少 10 个字"); return; }
    setBusy(true);
    setError("");
    try {
      await api(`/api/rfq/demands/${demandId}/qa`, { method: "POST", body: { question: question.trim() } });
      setQuestion("");
      load();
    } catch (e) {
      setError((e as Error).message || "提交失败");
    } finally {
      setBusy(false);
    }
  };

  const submitAnswer = async (qaId: number) => {
    const answer = (answers[qaId] ?? "").trim();
    if (!answer) { setError("答复内容不能为空"); return; }
    setBusy(true);
    setError("");
    try {
      await api(`/api/rfq/demands/${demandId}/qa/${qaId}/answer`, { method: "POST", body: { answer } });
      setAnswers((prev) => ({ ...prev, [qaId]: "" }));
      load();
    } catch (e) {
      setError((e as Error).message || "答复失败");
    } finally {
      setBusy(false);
    }
  };

  if (!isOwner && !canAsk && items.length === 0) return null;

  return (
    <Card className="rounded-2xl p-6">
      <h2 className="text-sm font-extrabold text-secondary-900 mb-4">答疑</h2>
      {items.length === 0 ? (
        <p className="text-xs text-secondary-400">暂无提问</p>
      ) : (
        <ul className="space-y-4">
          {items.map((q) => (
            <li key={q.id} className="rounded-xl border border-secondary-100 p-3">
              <p className="text-xs text-secondary-500">
                {q.askedByMe ? "我" : "供应商"} · {formatYmd(q.createdAt ?? undefined)}
              </p>
              <p className="mt-1 text-sm text-secondary-800 whitespace-pre-wrap">{q.question}</p>
              {q.answer ? (
                <div className="mt-2 rounded-lg bg-secondary-50 p-3">
                  <p className="text-2xs font-bold text-secondary-500">采购方答复</p>
                  <p className="mt-1 text-sm text-secondary-700 whitespace-pre-wrap">{q.answer}</p>
                </div>
              ) : isOwner ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    className="w-full rounded-lg border border-secondary-200 p-2 text-sm"
                    rows={2}
                    placeholder="答复（答复后对所有可见方展示）"
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  />
                  <Button size="sm" disabled={busy} onClick={() => void submitAnswer(q.id)}>提交答复</Button>
                </div>
              ) : (
                <p className="mt-2 text-2xs text-secondary-400">待采购方答复</p>
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
            placeholder="向采购方提问（至少 10 个字，公开提问所有人可见）"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <Button size="sm" disabled={busy} onClick={() => void submitQuestion()}>提交提问</Button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
    </Card>
  );
}

export default function RfqDetailPageClient() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
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
      .catch((err: Error) => setError(err.message || "加载失败"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="py-16 text-center text-sm text-secondary-400">加载中…</div>;
  }

  if (error || !detail) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-sm text-secondary-500">{error || "需求不存在"}</p>
        <Button variant="outline" size="sm" onClick={() => window.history.back()}>返回</Button>
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
            {meta.label}
          </span>
          {detail.categoryL1 && (
            <span className="px-2.5 py-1 rounded-full bg-secondary-100 text-secondary-600 text-xs font-semibold">
              {detail.categoryL1}{detail.categoryL2 ? ` / ${detail.categoryL2}` : ""}
            </span>
          )}
          {detail.visibility === "targeted" && (
            <span className="px-2.5 py-1 rounded-full bg-secondary-100 text-secondary-600 text-xs font-semibold">
              定向邀约
            </span>
          )}
        </div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-secondary-900 leading-snug">
          {detail.title}
        </h1>
        <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-secondary-400">
          {detail.reference && (
            <span className="flex items-center gap-1">
              <Hash className="w-3.5 h-3.5" /> 需求编号 {detail.reference}
            </span>
          )}
          {detail.closeAt && (
            <span className="flex items-center gap-1">
              <CalendarClock className="w-3.5 h-3.5" />
              报价截止：{formatYmd(detail.closeAt)}（{formatCloseCountdown(detail.closeAt)}）
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
          <p className="text-sm font-bold text-secondary-800">这是一条定向邀约需求</p>
          <p className="mt-1 text-xs text-secondary-500">
            仅被邀请的供应商可以查看完整需求并报价。如需参与，请联系采购方或将你加入邀约名单。
          </p>
        </Card>
      ) : (
        <>
          {canQuote && (
            <Card className="rounded-2xl p-5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-bold text-secondary-800">对此需求报价</p>
                <p className="text-xs text-secondary-400 mt-0.5">
                  截止前报价互相不可见；截止后统一开价
                </p>
              </div>
              <Button size="sm" onClick={() => setQuoteOpen(true)} className="shrink-0">立即报价</Button>
            </Card>
          )}

          {detail.isOwner && detail.status === DEMAND_STATUS.PUBLISHED && detail.noticePk && (
            <InvitePanel rfqId={detail.noticePk} visibility={detail.visibility} />
          )}

          {detail.isOwner && detail.noticePk && (
            <QuotesPanel rfqId={detail.noticePk} demandId={detail.id} />
          )}

          <Card className="rounded-2xl p-6">
            <h2 className="text-sm font-extrabold text-secondary-900 mb-4">商务条款</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TermItem icon={Wallet} label="采购预算" value={formatBudget(detail.budgetAmount, detail.currency, detail.budgetConfidential)} />
              <TermItem icon={Truck} label="贸易术语" value={detail.incoterm} />
              <TermItem icon={CalendarClock} label="交付时间" value={detail.deliveryTime} />
              <TermItem icon={MapPin} label="交付地点" value={detail.deliveryAddress || detail.province} />
              <TermItem icon={Landmark} label="付款方式" value={detail.paymentTerms.join("、")} />
              <TermItem icon={Globe2} label="可见范围" value={detail.visibility === "public" ? "公开询价" : "定向邀约"} />
            </div>
            {(detail.quantity != null || detail.quantityUnit) && (
              <p className="mt-3 text-xs text-secondary-500">
                采购数量：{detail.quantity ?? "—"} {detail.quantityUnit}
              </p>
            )}
            {detail.supplierReqs.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-secondary-400 mb-2 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> 供应商要求
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
              <Building2 className="w-4 h-4 text-primary-600" /> 需求描述
            </h2>
            <p className="text-sm text-secondary-700 leading-7 whitespace-pre-wrap">{detail.description}</p>
          </Card>

          {detail.isOwner && detail.rejectReason && (
            <Card className="rounded-2xl p-5 border border-rose-100 bg-rose-50">
              <p className="text-sm font-bold text-rose-700">审核退回意见</p>
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
              该需求已结案（{meta.label}），不再接受新的报价。
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
