"use client";

/**
 * RFQ 详情页
 * RFQ Detail Page
 *
 * @module app/(public)/rfq/[id]/page-client
 * @description 展示单条采购需求：结构化商务条款 + 需求描述。
 *              published 公开可见；创建者可查看未发布状态（isOwner 标记）。
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Building2, CalendarClock, FileText, Globe2, Hash, Landmark,
  MapPin, ShieldCheck, Truck, Wallet,
} from "lucide-react";

import { api } from "@/core/http";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { Button, Card } from "@/shared/ui";
import { formatDeadlineDateYMD, currencySymbol } from "@/shared/utils/format";
import { QuoteDialog } from "@/features/rfq/components/QuoteDialog";
import { QuotesPanel } from "@/features/rfq/components/QuotesPanel";
import { InvitePanel } from "@/features/rfq/components/InvitePanel";
import { PAYMENT_LABEL_KEYS, SUPPLIER_REQ_LABEL_KEYS } from "@/features/rfq/constants";

interface RfqDetail {
  id: number;
  reference: string;
  title: string;
  description: string;
  status: string;
  categoryL1: string;
  categoryL2: string;
  province: string;
  budget: number | null;
  budgetConfidential: boolean;
  currency: string;
  incoterm: string;
  deliveryTime: string;
  deliveryAddress: string;
  paymentTerms: string[];
  supplierReqs: string[];
  visibility: string;
  deadlineSec: number;
  publishedDate: string | null;
  isOwner: boolean;
}

/** 状态 → i18n 键（未知状态原样展示，行为与旧版一致） */
const STATUS_LABELS: Record<string, string> = {
  draft: "rfqStatusDraft",
  pending_review: "rfqStatusPendingReview",
  published: "rfqStatusPublished",
  rejected: "rfqStatusReviewFailed",
  closed: "rfqStatusClosed",
};

type TFn = (key: string, params?: Record<string, string | number>) => string;

function formatBudget(d: RfqDetail, t: TFn): string {
  if (d.budgetConfidential) return t("rfqBudgetNegotiableConfidential");
  const budget = d.budget ?? 0;
  if (!budget) return t("rfqBudgetNegotiable");
  // 平台预算以“万元”为单位，与广场/设置页同口径
  return t("rfqBudgetWanSymbol", { symbol: currencySymbol(d.currency), budget });
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

export default function RfqDetailPageClient() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [detail, setDetail] = useState<RfqDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const { authUser } = useAuth();
  const { t } = useLocale();
  const [quoteOpen, setQuoteOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api<RfqDetail>(`/api/rfq/${id}`)
      .then((res) => setDetail(res))
      .catch((err: Error) => setError(err.message || t("rfqLoadFailed")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 保持原依赖（仅 id），语言切换不触发重新拉取
  }, [id]);

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-secondary-400">{t("rfqLoading")}</div>
    );
  }

  if (error || !detail) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-sm text-secondary-500">{error || t("rfqNotFound")}</p>
        <Button variant="outline" size="sm" onClick={() => window.history.back()}>{t("rfqBack")}</Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 头部 */}
      <Card className="rounded-2xl p-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="px-2.5 py-1 rounded-full bg-primary-50 text-primary-700 text-xs font-bold">
            {STATUS_LABELS[detail.status] ? t(STATUS_LABELS[detail.status]) : detail.status}
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
              <Hash className="w-3.5 h-3.5" />
              {t("rfqReferenceNo", { ref: detail.reference })}
            </span>
          )}
          <span className="flex items-center gap-1">
            <CalendarClock className="w-3.5 h-3.5" />
            {t("rfqDeadlineAt", { date: formatDeadlineDateYMD(detail.deadlineSec) })}
          </span>
          {detail.publishedDate && (
            <span className="flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" />
              {t("rfqPublishedOn", { date: detail.publishedDate.slice(0, 10) })}
            </span>
          )}
          {detail.province && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {detail.province}
            </span>
          )}
        </div>
      </Card>

      {/* 报价入口：已发布 + 非创建者 + 已登录（资格/截止由后端闸口把关） */}
      {detail.status === "published" && !detail.isOwner && authUser && (
        <Card className="rounded-2xl p-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-bold text-secondary-800">{t("rfqQuoteEntryTitle")}</p>
            <p className="text-xs text-secondary-400 mt-0.5">{t("rfqDeadlineAt", { date: formatDeadlineDateYMD(detail.deadlineSec) })}</p>
          </div>
          <Button size="sm" onClick={() => setQuoteOpen(true)} className="shrink-0">{t("rfqQuoteNow")}</Button>
        </Card>
      )}

      {/* 创建者：邀约匹配供应商报价（已发布） */}
      {detail.isOwner && authUser && detail.status === "published" && (
        <InvitePanel rfqId={detail.id} visibility={detail.visibility} />
      )}

      {/* 创建者：报价汇总 / 比价 / 选定 */}
      {detail.isOwner && authUser && (
        <QuotesPanel rfqId={detail.id} />
      )}

      {/* 商务条款 */}
      <Card className="rounded-2xl p-6">
        <h2 className="text-sm font-extrabold text-secondary-900 mb-4">{t("rfqTermsSection")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TermItem icon={Wallet} label={t("rfqTermBudget")} value={formatBudget(detail, t)} />
          <TermItem icon={Truck} label={t("rfqTermIncoterm")} value={detail.incoterm} />
          <TermItem icon={CalendarClock} label={t("rfqTermDeliveryTime")} value={detail.deliveryTime} />
          <TermItem icon={MapPin} label={t("rfqFieldAddress")} value={detail.deliveryAddress || detail.province} />
          <TermItem icon={Landmark} label={t("rfqFieldPayment")} value={detail.paymentTerms.map((v) => (PAYMENT_LABEL_KEYS[v] ? t(PAYMENT_LABEL_KEYS[v]) : v)).join(t("rfqEnumSep"))} />
          <TermItem icon={Globe2} label={t("rfqFieldVisibility")} value={detail.visibility === "public" ? t("rfqVisibilityPublic") : t("rfqVisibilityTargeted")} />
        </div>
        {detail.supplierReqs.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-secondary-400 mb-2 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> {t("rfqSupplierReqsLabel")}
            </p>
            <div className="flex flex-wrap gap-2">
              {detail.supplierReqs.map((req) => (
                <span key={req} className="px-2.5 py-1 rounded-lg bg-secondary-100 text-secondary-600 text-xs font-semibold">
                  {SUPPLIER_REQ_LABEL_KEYS[req] ? t(SUPPLIER_REQ_LABEL_KEYS[req]) : req}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* 需求描述 */}
      <Card className="rounded-2xl p-6">
        <h2 className="text-sm font-extrabold text-secondary-900 mb-4 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary-600" /> {t("rfqFieldDescription")}
        </h2>
        <p className="text-sm text-secondary-700 leading-7 whitespace-pre-wrap">
          {detail.description}
        </p>
      </Card>

      <QuoteDialog
        open={quoteOpen}
        rfqId={detail.id}
        defaultCurrency={detail.currency}
        onClose={() => setQuoteOpen(false)}
      />
    </div>
  );
}
