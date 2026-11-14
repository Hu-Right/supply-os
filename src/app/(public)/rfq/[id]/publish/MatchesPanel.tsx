"use client";

/**
 * 第 7 步产出：已匹配供应商（内联在发布页，取代 /settings/rfq/[id]/matches）
 *
 * @module app/(public)/rfq/[id]/publish/MatchesPanel
 * @description 2026-11 流程收口：匹配名单原本是设置中心下的独立页，与"发布即匹配"的语义
 *              割裂。现内联为已发布视图里的一段，并提供空态/失败态与重试
 *              （旧页失败时只有一行裸错误、没有重试）。
 */
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/core/i18n";
import { fetchMatches } from "@/features/procurement-demand/api";

interface MatchItem {
  supplierId: number;
  company: string;
  province: string;
  city: string;
  score: number;
  reasons: string;
}

export function MatchesPanel({ projectId }: { projectId: number }) {
  const { t } = useLocale();
  const [items, setItems] = useState<MatchItem[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetchMatches(projectId);
      setItems(r.items);
    } catch (err) {
      setItems(null);
      setError((err as Error).message || t("pc_err_generic"));
    } finally {
      setLoading(false);
    }
  }, [projectId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section id="matches" className="rounded-2xl border border-secondary-200 bg-white p-5 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-extrabold text-secondary-900">{t("pc_match_title")}</h3>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-secondary-300 px-3 py-1.5 text-xs font-semibold text-secondary-600 hover:bg-secondary-50 disabled:opacity-50"
        >
          {t("pc_retry")}
        </button>
      </div>

      {loading && <p className="mt-3 text-sm text-secondary-400">{t("pc_loading")}</p>}

      {!loading && error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      {!loading && !error && items && items.length === 0 && (
        <p className="mt-3 text-sm text-secondary-400">{t("pc_match_empty")}</p>
      )}

      {!loading && !error && items && items.length > 0 && (
        <ul className="mt-3 grid gap-2">
          {items.map((m) => (
            <li key={m.supplierId} className="flex items-center justify-between gap-3 rounded-xl border border-secondary-100 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-secondary-900">{m.company}</p>
                <p className="mt-0.5 truncate text-xs text-secondary-400">
                  {[m.province, m.city, m.reasons].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="shrink-0 text-lg font-extrabold text-teal-700">{m.score}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-secondary-400">{t("pc_match_hint")}</p>
    </section>
  );
}
