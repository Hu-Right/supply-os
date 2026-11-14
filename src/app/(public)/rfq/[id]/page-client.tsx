"use client";

/**
 * /rfq/[id] — 采购需求公开详情（新发布域）
 * @module app/(public)/rfq/[id]/page-client
 * @description 读 /api/procurement/projects/[id] 公开视图（非 owner 自动按 F02 分级授权
 *              裁剪；未发布需求一律 404 防猜 ID）。owner 额外看到核验时间线（F04/F05）。
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { fetchProject, type ProjectDetail } from "@/features/procurement-demand/api";

const VERIFY_BADGE: Record<string, string> = {
  pass: "bg-teal-100 text-teal-800",
  pending: "bg-amber-100 text-amber-800",
  need_info: "bg-amber-100 text-amber-800",
  risk: "bg-red-100 text-red-700",
  reject: "bg-red-100 text-red-700",
};

const REVIEW_RESULT_LABEL: Record<string, { zh: string; en: string; cls: string }> = {
  pass: { zh: "通过", en: "Pass", cls: "bg-teal-100 text-teal-800" },
  need_info: { zh: "需补充", en: "Need info", cls: "bg-amber-100 text-amber-800" },
  risk: { zh: "存在风险", en: "Risk", cls: "bg-red-100 text-red-700" },
  reject: { zh: "不通过", en: "Rejected", cls: "bg-red-100 text-red-700" },
};

const REVIEW_STAGE_LABEL: Record<string, { zh: string; en: string }> = {
  auto: { zh: "系统自动初审", en: "Automated check" },
  identity: { zh: "主体身份核验", en: "Entity verification" },
  requirement: { zh: "需求真实性核验", en: "Requirement verification" },
  feasibility: { zh: "技术可招标性", en: "Technical feasibility" },
  authorization: { zh: "授权书核验", en: "Authorization verification" },
  fund: { zh: "资金核验", en: "Funding verification" },
};

function RfqDetailContent() {
  const params = useParams<{ id: string }>();
  const { locale } = useLocale();
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!params?.id) return;
    let cancelled = false;
    fetchProject(Number(params.id))
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch((err) => { if (!cancelled) setError((err as Error).message); });
    return () => { cancelled = true; };
  }, [params?.id]);

  if (error) return <div className="py-16 text-center text-sm text-secondary-500">{error}</div>;
  if (!detail) return <div className="py-16 text-center text-sm text-secondary-400">…</div>;

  const zh = locale === "zh";
  const t2 = (cn: string, en: string) => (zh ? cn : en);
  const items = detail.items ?? [];
  const reviews = detail.reviews ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="rounded-2xl border border-secondary-200 bg-white p-8 shadow-xs">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h1 className="text-xl font-extrabold text-secondary-900">{zh ? detail.titleZh : detail.titleEn || detail.titleZh}</h1>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${VERIFY_BADGE[detail.requirementVerify] ?? "bg-secondary-100 text-secondary-600"}`}>
            {t2("需求核验", "Verified")}: {detail.requirementVerify}
          </span>
        </div>
        <div className="mt-2 text-xs text-secondary-400">{detail.reference} · v{detail.versionNo} · {detail.buyerOrgName}</div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 text-sm text-secondary-700">
          <div>{t2("采购性质", "Purpose")}: {detail.purpose}</div>
          <div>{t2("需求对象", "Scope")}: {detail.objectTypes.join(" / ")}</div>
          {detail.usageEnv && <div className="sm:col-span-2">{t2("用途及使用环境", "Usage & environment")}: {detail.usageEnv}</div>}
          {detail.standards && <div className="sm:col-span-2">{t2("强制标准/认证", "Mandatory standards")}: {detail.standards}</div>}
          <div>{t2("交付地", "Delivery")}: {detail.deliveryCountry} {detail.deliveryCity} {detail.deliveryAddress}</div>
          {detail.batchDelivery && <div>{t2("分批采购/交付", "Batch delivery")}: {detail.batchNote || t2("是", "Yes")}</div>}
          {detail.budgetAmount != null && (
            <div>{t2("预算", "Budget")}: {detail.budgetAmount} {detail.budgetCurrency}</div>
          )}
          {detail.quoteDeadlineAt && (
            <div>{t2("报价截止", "Quote deadline")}: {new Date(detail.quoteDeadlineAt * 1000).toISOString().slice(0, 10)}</div>
          )}
          {detail.deadlineDate && <div>{t2("最晚交付", "Latest delivery")}: {detail.deadlineDate}</div>}
          {detail.incoterm && <div>Incoterms: {detail.incoterm} {detail.incotermVersion}</div>}
          {detail.logisticsNote && <div className="sm:col-span-2">{t2("运输/包装/清关", "Logistics")}: {detail.logisticsNote}</div>}
          {detail.paymentTerms && <div>{t2("付款条件", "Payment")}: {detail.paymentTerms}</div>}
          {detail.installNeeds.length > 0 && <div>{t2("交付服务", "Services")}: {detail.installNeeds.join(" / ")}</div>}
          {detail.guarantees.length > 0 && <div>{t2("保函要求", "Guarantees")}: {detail.guarantees.join(" / ")}</div>}
          {detail.supplierCountryLimit && <div>{t2("供应商国别限制", "Supplier countries")}: {detail.supplierCountryLimit}</div>}
          {detail.manufacturerOnly && <div>{t2("要求制造商直接投标", "Manufacturer direct bidding")}</div>}
          {detail.supplierQuals && <div>{t2("资质/业绩要求", "Qualification")}: {detail.supplierQuals}</div>}
          {detail.supplierConfirmDate && <div>{t2("预计确定供应商", "Expected award")}: {detail.supplierConfirmDate}</div>}
          {detail.contractDate && <div>{t2("预计签约", "Expected contract")}: {detail.contractDate}</div>}
        </div>

        {detail.background && (
          <div className="mt-6">
            <h2 className="text-sm font-bold text-secondary-900">{t2("项目背景", "Background")}</h2>
            <p className="mt-1 whitespace-pre-line text-sm text-secondary-700">{detail.background}</p>
          </div>
        )}

        {items.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-bold text-secondary-900">{t2("采购明细", "Item list")}</h2>
            <div className="mt-2 grid gap-2">
              {items.map((it) => (
                <div key={it.id} className="rounded-lg border border-secondary-200 p-3 text-sm text-secondary-700">
                  {it.lineNo}. {zh ? it.nameZh : it.nameEn || it.nameZh}
                  {it.spec ? `（${it.spec}）` : ""} × {it.quantity ?? "-"} {it.qtyUnit}
                  {it.qtyType === "estimated" && <span className="ml-2 text-xs text-amber-700">{t2("预估数量", "estimated")}</span>}
                  {it.alternativesAllowed && <span className="ml-2 text-xs text-secondary-400">{t2("允许同等/替代", "alternatives allowed")}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 采购方本人：核验时间线（F04 自动初审 + F05 人工核验留痕） */}
        {detail.isOwner && reviews.length > 0 && (
          <div className="mt-6 rounded-xl border border-secondary-200 bg-secondary-50/50 p-4">
            <h2 className="text-sm font-bold text-secondary-900">{t2("核验记录", "Verification history")}</h2>
            <div className="mt-2 grid gap-2">
              {reviews.map((r) => {
                const res = REVIEW_RESULT_LABEL[r.result] ?? { zh: r.result, en: r.result, cls: "bg-secondary-100" };
                return (
                  <div key={r.id} className="flex items-start justify-between gap-3 rounded-lg bg-white px-3 py-2 text-xs">
                    <div>
                      <div className="font-semibold text-secondary-700">
                        {REVIEW_STAGE_LABEL[r.stage]?.[zh ? "zh" : "en"] ?? r.stage} · v{r.versionNo}
                      </div>
                      {r.note && <div className="mt-1 text-secondary-500">{r.note}</div>}
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 font-semibold ${res.cls}`}>{zh ? res.zh : res.en}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PageClient() {
  return <RfqDetailContent />;
}
