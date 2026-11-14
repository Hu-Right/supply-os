"use client";

/**
 * 需求广场（公开列表，读 /api/procurement/plaza）
 * @module features/procurement-demand/ProcurementPlaza
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/core/i18n";
import { fetchPlaza, type ProjectSummary } from "./api";

export function ProcurementPlaza() {
  const { t, locale } = useLocale();
  const [items, setItems] = useState<ProjectSummary[]>([]);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPlaza({ keyword, page: 1 })
      .then((r) => { if (!cancelled) { setItems(r.items); setError(""); } })
      .catch((err) => { if (!cancelled) setError((err as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [keyword]);

  const fmtDate = (sec: number | null) =>
    sec ? new Date(sec * 1000).toISOString().slice(0, 10) : "-";

  return (
    <div className="rounded-2xl border border-secondary-200 bg-white p-6 shadow-xs">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold text-secondary-900">{t("pc_plaza_title")}</h2>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={t("pc_plaza_search")}
          className="w-56 rounded-lg border border-secondary-300 px-3 py-2 text-sm"
        />
      </div>
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
      {loading ? (
        <div className="py-8 text-center text-sm text-secondary-400">{t("pc_loading")}</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-sm text-secondary-400">{t("pc_plaza_empty")}</div>
      ) : (
        <div className="grid gap-3">
          {items.map((p) => (
            <Link key={p.id} href={`/rfq/${p.id}`} className="block rounded-xl border border-secondary-200 p-4 hover:border-teal-400">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-secondary-900">{locale === "zh" ? p.titleZh : p.titleEn || p.titleZh}</div>
                  <div className="mt-1 text-xs text-secondary-400">{p.reference} · v{p.versionNo}</div>
                </div>
                <div className="text-right text-xs text-secondary-500">
                  <div>{t("pc_plaza_published")} {fmtDate(p.publishedAt)}</div>
                  <div>{p.deliveryCountry} {p.deliveryCity}</div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {p.budgetAmount != null && (
                  <span className="rounded-full bg-secondary-100 px-2 py-0.5 text-secondary-600">
                    {t("pc_budget")}: {p.budgetAmount} {p.budgetCurrency}
                  </span>
                )}
                {p.quoteDeadlineAt && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
                    {t("pc_plaza_deadline")} {fmtDate(p.quoteDeadlineAt)}
                  </span>
                )}
                {p.primaryUgtCode && (
                  <span className="rounded-full bg-teal-50 px-2 py-0.5 text-teal-700">{p.primaryUgtCode}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
