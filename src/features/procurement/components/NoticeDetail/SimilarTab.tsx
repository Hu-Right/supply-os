/**
 * 相似机会 Tab：按 UNSPSC 品类语义相似的真实公告推荐
 * Similar Opportunities Tab — UNSPSC category similarity
 *
 * @module features/procurement/components/NoticeDetail/SimilarTab
 * @description 调 /api/notices/:id/similar 取共享 UNSPSC 类目的活跃公告（最多 6 条）。
 *              无同类时服务端返回空数组，前端展示引导回列表的空态（不做兜底、不补齐）。
 */
import { useEffect, useState } from "react";
import { ArrowRight, Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { getCountryDisplayName } from "@/shared/data/countryNames";
import { fetchSimilarNotices } from "../../api";
import { formatDeadlineZh } from "../../utils/formatDeadlineZh";
import type { NoticeItem } from "../../types";

interface SimilarTabProps {
  notice: NoticeItem;
  /** 点击相似公告时打开其详情 */
  onOpen: (notice: NoticeItem) => void;
}

const SIMILAR_LIMIT = 6;

export function SimilarTab({ notice, onOpen }: SimilarTabProps) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [items, setItems] = useState<NoticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    if (notice.id == null) { setItems([]); setExhausted(true); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setExhausted(false);
    setItems([]);

    fetchSimilarNotices(notice.id, SIMILAR_LIMIT, locale)
      .then((res) => {
        if (cancelled) return;
        const hits = res.items || [];
        setItems(hits);
        setExhausted(hits.length === 0);
      })
      .catch(() => { if (!cancelled) setExhausted(true); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [notice.id, locale]);

  const metaLine = (item: NoticeItem) => {
    const country = getCountryDisplayName(item.country || "", locale);
    const deadline =
      locale === "zh"
        ? formatDeadlineZh(item.deadline, item.deadline_ts) || ""
        : item.deadline || "";
    return [country, deadline].filter(Boolean).join(" · ");
  };

  return (
    <section className="space-y-4">
      <h3 className="text-base font-extrabold text-slate-900">
        {t("detail_tabSimilar") || "相似机会"}
      </h3>

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && exhausted && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <Globe className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500 mb-3">
            {t("detail_similarEmpty") || "暂无相似公告"}
          </p>
          <button
            type="button"
            onClick={() => router.push("/procurement")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-700 px-4 py-2 text-sm font-bold transition-colors"
          >
            {t("detail_similarBrowseAll") || "浏览全部商机"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpen(item)}
              className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 hover:border-teal-200 hover:bg-teal-50/50 transition-colors text-left group"
            >
              <p
                dir="auto"
                className="text-sm font-bold text-slate-800 line-clamp-2 group-hover:text-teal-700 transition-colors"
              >
                {item.title_i18n || item.title_en || item.title}
              </p>
              {metaLine(item) && (
                <p className="text-2xs text-slate-400 mt-1 truncate">{metaLine(item)}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
