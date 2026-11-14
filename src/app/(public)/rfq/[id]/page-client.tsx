"use client";

/**
 * /rfq/[id] — 采购需求公开详情（新发布域）
 * @module app/(public)/rfq/[id]/page-client
 * @description 读 /api/procurement/projects/[id] 公开视图（非 owner 自动按 F02 分级授权
 *              裁剪；未发布需求一律 404 防猜 ID）。
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { fetchProject, type ProjectDetail } from "@/features/procurement-demand/api";

const VERIFY_BADGE: Record<string, string> = {
  pass: "bg-teal-100 text-teal-800",
  pending: "bg-amber-100 text-amber-800",
  need_info: "bg-amber-100 text-amber-800",
  reject: "bg-red-100 text-red-700",
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
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="rounded-2xl border border-secondary-200 bg-white p-8 shadow-xs">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h1 className="text-xl font-extrabold text-secondary-900">{zh ? detail.titleZh : detail.titleEn || detail.titleZh}</h1>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${VERIFY_BADGE[detail.requirementVerify] ?? ""}`}>
            {zh ? "需求真实性" : "Requirement"}: {detail.requirementVerify}
          </span>
        </div>
        <div className="mt-2 text-xs text-secondary-400">{detail.reference} · v{detail.versionNo} · {detail.buyerOrgName}</div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 text-sm text-secondary-700">
          <div>{zh ? "采购目的" : "Purpose"}: {detail.purpose}</div>
          <div>{zh ? "交付地" : "Delivery"}: {detail.deliveryCountry} {detail.deliveryCity}</div>
          {detail.budgetAmount != null && (
            <div>{zh ? "预算" : "Budget"}: {detail.budgetAmount} {detail.budgetCurrency}</div>
          )}
          {detail.quoteDeadlineAt && (
            <div>{zh ? "报价截止" : "Quote deadline"}: {new Date(detail.quoteDeadlineAt * 1000).toISOString().slice(0, 10)}</div>
          )}
          {detail.incoterm && <div>Incoterms: {detail.incoterm}</div>}
        </div>

        {detail.background && (
          <div className="mt-6">
            <h2 className="text-sm font-bold text-secondary-900">{zh ? "项目背景" : "Background"}</h2>
            <p className="mt-1 whitespace-pre-line text-sm text-secondary-700">{detail.background}</p>
          </div>
        )}

        {detail.items.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-bold text-secondary-900">{zh ? "采购明细" : "Item list"}</h2>
            <div className="mt-2 grid gap-2">
              {detail.items.map((it) => (
                <div key={it.id} className="rounded-lg border border-secondary-200 p-3 text-sm text-secondary-700">
                  {it.lineNo}. {zh ? it.nameZh : it.nameEn || it.nameZh}
                  {it.spec ? `（${it.spec}）` : ""} × {it.quantity ?? "-"} {it.qtyUnit}
                </div>
              ))}
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
