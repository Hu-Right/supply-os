"use client";

/**
 * /settings/rfq/[id]/matches — 已匹配供应商（七步流程第 7 步产出）
 * @module app/(public)/settings/rfq/[id]/matches/page-client
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { fetchMatches } from "@/features/procurement-demand/api";

export default function PageClient() {
  const params = useParams<{ id: string }>();
  const { t } = useLocale();
  const [items, setItems] = useState<Array<{ supplierId: number; company: string; province: string; city: string; score: number; reasons: string }> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!params?.id) return;
    let cancelled = false;
    fetchMatches(Number(params.id))
      .then((r) => { if (!cancelled) setItems(r.items); })
      .catch((err) => { if (!cancelled) setError((err as Error).message); });
    return () => { cancelled = true; };
  }, [params?.id]);

  if (error) return <div className="py-10 text-center text-sm text-secondary-500">{error}</div>;
  if (!items) return <div className="py-10 text-center text-sm text-secondary-400">…</div>;
  if (items.length === 0) return <div className="py-10 text-center text-sm text-secondary-400">{t("pc_match_empty")}</div>;

  return (
    <div className="rounded-2xl border border-secondary-200 bg-white p-6 shadow-xs">
      <h1 className="mb-4 text-lg font-extrabold text-secondary-900">{t("pc_match_title")}</h1>
      <div className="grid gap-3">
        {items.map((m) => (
          <div key={m.supplierId} className="flex items-center justify-between rounded-xl border border-secondary-200 p-4">
            <div>
              <div className="text-sm font-bold text-secondary-900">{m.company}</div>
              <div className="mt-1 text-xs text-secondary-400">{m.province} {m.city} · {m.reasons}</div>
            </div>
            <div className="text-lg font-extrabold text-teal-700">{m.score}</div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-secondary-400">{t("pc_match_hint")}</p>
    </div>
  );
}
