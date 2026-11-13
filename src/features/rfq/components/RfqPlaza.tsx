"use client";

/**
 * 需求广场（v2）
 * @module features/rfq/components/RfqPlaza
 *
 * @description 数据来自 GET /api/rfq/list（读 `rfq_demand`，只含报价窗口内的公开需求）。
 *              卡片字段与详情同源：金额按"元/万元"自动换算，截止时间按 Asia/Shanghai 取日，
 *              不再展示"万元当元"或 UTC/本地混用的日期。
 */
import { useRouter } from "next/navigation";
import { Clock, Gem, Search } from "lucide-react";

import { cn } from "@/shared/utils";
import { useLocale } from "@/core/i18n";
import { Button, EmptyState, Input, SegmentedControl, Select } from "@/shared/ui";
import type { PlazaRfq } from "../types";
import { useRfqPlaza, type RfqSortKey } from "../hooks/useRfqPlaza";
import { formatBudget, formatCloseCountdown, formatYmd } from "../model/format";

export function RfqPlaza() {
  const { t } = useLocale();
  const {
    keyword, setKeyword,
    categoryL1, setCategoryL1,
    sort, setSort,
    items, loading, total, l1Options, error, retry,
  } = useRfqPlaza();
  const router = useRouter();

  return (
    <section className="rounded-2xl border border-secondary-200 bg-white p-6 shadow-xs" id="rfq-plaza">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-extrabold text-secondary-900">{t("rfqPlazaTitle")}</h2>
          <p className="text-xs text-secondary-400 mt-1">
            {total > 0 ? t("rfqPlazaSubtitleCount", { count: total }) : t("rfqPlazaSubtitleBase")}
            <button
              onClick={() => router.push("/settings/rfq-quotes")}
              className="ml-2 text-secondary-600 font-bold underline underline-offset-2 hover:text-secondary-800"
            >
              {t("rfqMyQuotesTitle")}
            </button>
          </p>
        </div>
        <SegmentedControl size="sm" value={sort} onChange={(v) => setSort(v as RfqSortKey)}
          items={[
            { value: "newest", label: t("rfqSortNewest") },
            { value: "deadline", label: t("rfqSortDeadline") },
            { value: "budget", label: t("rfqSortBudget") },
          ]} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-5">
        <Input leftIcon={<Search className="w-4 h-4" />} value={keyword}
          onChange={(e) => setKeyword(e.target.value)} placeholder={t("rfqSearchPlaceholder")} aria-label={t("rfqSearchPlaceholder")} />
        <Select value={categoryL1} onChange={(e) => setCategoryL1(e.target.value)} aria-label={t("rfqPlazaIndustryFilter")}>
          <option value="">{t("allIndustries")}</option>
          {l1Options.map((o) => (
            <option key={o.key} value={o.key}>{o.nameZh || o.nameEn || o.key}</option>
          ))}
        </Select>

      </div>

      {loading && items.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border border-secondary-100 p-4 animate-pulse">
              <div className="h-4 w-16 bg-secondary-100 rounded mb-3" />
              <div className="h-4 w-full bg-secondary-100 rounded mb-2" />
              <div className="h-3 w-3/4 bg-secondary-50 rounded mb-2" />
              <div className="h-3 w-1/2 bg-secondary-50 rounded" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="text-sm font-bold text-rose-700">{t("rfqPlazaLoadFailed")}</p>
          <p className="mt-1 text-xs text-rose-600">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={retry}>{t("rfqPlazaRetry")}</Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={t("rfqEmptyTitle")}
          description={t("rfqPlazaEmptyDesc")}
          action={<Button onClick={() => document.getElementById("rfq-form")?.scrollIntoView({ behavior: "smooth" })}>{t("rfqEmptyCta")}</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {items.map((rfq) => <PlazaCard key={rfq.id} rfq={rfq} />)}
        </div>
      )}
    </section>
  );
}

function PlazaCard({ rfq }: { rfq: PlazaRfq }) {
  const { t } = useLocale();
  const router = useRouter();
  const tag = rfq.categoryL2 || rfq.categoryL1 || "";
  const remain = formatCloseCountdown(rfq.closeAt, undefined, t);
  const urgent = rfq.closeAt != null && rfq.closeAt > 0
    ? rfq.closeAt - Date.now() / 1000 < 72 * 3600
    : false;

  return (
    <div className="relative flex flex-col rounded-xl border border-secondary-200 p-4 transition-shadow hover:shadow-md">
      <div className="flex items-center gap-2 mb-2">
        {tag && (
          <span className="inline-block rounded border border-secondary-200 bg-secondary-100 px-2 py-0.5 text-2xs font-bold text-secondary-700">
            {tag}
          </span>
        )}
        {urgent && (
          <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-2xs font-bold text-amber-700">
            <Clock className="w-3 h-3" /> {remain}
          </span>
        )}
      </div>
      <h4 className="text-sm font-bold text-secondary-900 mb-2 leading-snug line-clamp-2">{rfq.title}</h4>
      <div className="space-y-1 text-xs text-secondary-500 flex-1">
        {rfq.province && (
          <p className="flex items-center gap-1.5">
            <Gem className="w-3 h-3" /> {rfq.province}
          </p>
        )}
        <p>{t("rfqCardBudget", { value: formatBudget(rfq.budgetAmount, rfq.currency, rfq.budgetConfidential, t) })}</p>
        {rfq.quantity != null && (
          <p>{t("rfqPlazaQuantity", { qty: rfq.quantity, unit: rfq.quantityUnit ?? "" })}</p>
        )}
        {rfq.responses > 0 && (
          <p className="text-secondary-600 font-semibold">{t("rfqCardResponses", { count: rfq.responses })}</p>
        )}
        {rfq.closeAt && (
          <p className={cn("flex items-center gap-1", urgent && "text-amber-700 font-bold")}>
            <Clock className="w-3 h-3" /> {t("rfqCardDeadline", { date: formatYmd(rfq.closeAt), remain })}
          </p>
        )}
      </div>
      <Button variant="outline" size="sm" className="mt-3 w-full"
        onClick={() => router.push(`/rfq/${rfq.id}`)}>
        {t("rfqViewDetail")}
      </Button>
    </div>
  );
}
