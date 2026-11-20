"use client";

/**
 * 需求摘要（只读）——第 4 步之后的每一屏复用同一份事实
 *
 * @module app/(public)/rfq/[id]/publish/ProjectSummary
 * @description 提交后（submitted / under_review / published / closed）不再可编辑，
 *              统一用这张卡展示"提交的是什么"，避免同一份内容在四个状态各写一套。
 */
import { useLocale } from "@/core/i18n";
import { formatDateShort } from "@/shared/utils/format";
import { PROCUREMENT_METHOD } from "@/shared/constants/procurement";
import type { ProjectDetail } from "@/features/procurement-demand/api";

/** 方式码值域（防脏值把 i18n 键打穿；落库默认恒为 rfq） */
const METHOD_KEYS = new Set<string>(Object.values(PROCUREMENT_METHOD));

/** unix 秒 → 本地 yyyy-MM-dd（秒为空回空串） */
function ymd(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return "";
  return formatDateShort(new Date(sec * 1000));
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold text-secondary-400">{label}</dt>
      <dd className="truncate text-sm text-secondary-800">{value || "—"}</dd>
    </div>
  );
}

export function ProjectSummary({ detail }: { detail: ProjectDetail }) {
  const { t } = useLocale();
  const budget =
    detail.budgetAmount == null
      ? "—"
      : `${detail.budgetCurrency || ""} ${detail.budgetAmount}`.trim();

  return (
    <section className="rounded-2xl border border-secondary-200 bg-white p-5 shadow-xs">
      <h3 className="text-base font-extrabold text-secondary-900">{t("pc_summary_title")}</h3>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Row label={t("pc_titleZh")} value={detail.titleZh || detail.titleEn} />
        <Row label={t("pc_purpose")} value={t(`pc_purpose_${detail.purpose}`)} />
        <Row
          label={t("pc_method")}
          value={t(`pc_method_${METHOD_KEYS.has(detail.method) ? detail.method : "rfq"}`)}
        />
        <Row label={t("pc_category")} value={detail.primaryUgtCode} />
        <Row label={t("pc_budget")} value={budget} />
        <Row label={t("pc_deliveryCountry")} value={detail.deliveryCountry} />
        <Row label={t("pc_deliveryCity")} value={detail.deliveryCity} />
        <Row label={t("pc_quoteDeadline")} value={detail.quoteDeadlineAt ? ymd(detail.quoteDeadlineAt) : ""} />
        <Row label={t("pc_items")} value={`${detail.items.length}`} />
        <Row label={t("pc_attachments")} value={`${detail.attachments.length}`} />
      </dl>
      <p className="mt-4 text-xs text-secondary-400">
        {detail.reference} · v{detail.versionNo}
        {detail.submittedAt ? ` · ${ymd(detail.submittedAt)}` : ""}
      </p>
    </section>
  );
}
