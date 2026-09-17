/**
 * 相似机会 Tab：同国家/同类型的真实公告推荐
 * Similar Opportunities Tab — real recommendations via unified-search
 *
 * @module features/procurement/components/NoticeDetail/SimilarTab
 * @description 用 unified-search 按 国家+采购类型 拉取最新公告，排除当前公告后取前 4 条；
 *              精确筛选命中不足时回退仅按国家，仍为空则展示引导回列表的空态。
 *              公告列表级 UNSPSC 码与搜索端 code_id（级联节点 id）不同源，故不参与筛选。
 */
import { useEffect, useState } from "react";
import { ArrowRight, Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { getCountryDisplayName } from "@/shared/data/countryNames";
import { fetchUnifiedSearch } from "../../api";
import { formatDeadlineZh } from "../../utils/formatDeadlineZh";
import type { NoticeItem } from "../../types";

interface SimilarTabProps {
  notice: NoticeItem;
  /** 点击相似公告时打开其详情 */
  onOpen: (notice: NoticeItem) => void;
}

const SIMILAR_COUNT = 4;

export function SimilarTab({ notice, onOpen }: SimilarTabProps) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [items, setItems] = useState<NoticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setExhausted(false);
    setItems([]);

    const base = {
      mode: "default" as const,
      page: 1,
      pageSize: SIMILAR_COUNT + 1,
      locale,
      sort: "latest",
    };
    // 命中剔除当前公告后截断
    const pick = (res: { items?: NoticeItem[] }) =>
      (res.items || []).filter((n) => n.id !== notice.id).slice(0, SIMILAR_COUNT);
    const byCountry = () => fetchUnifiedSearch({ ...base, country: notice.country || "" });

    const run: Promise<{ items?: NoticeItem[] } | void> = notice.notice_type
      ? fetchUnifiedSearch({ ...base, country: notice.country || "", noticeType: notice.notice_type }).then(
          (res): Promise<{ items?: NoticeItem[] } | void> => {
            const hits = pick(res);
            if (cancelled) return Promise.resolve();
            // 精确筛选有足够命中直接用；不足半数再按国家放宽兜底
            if (hits.length >= SIMILAR_COUNT / 2) {
              setItems(hits);
              setLoading(false);
              return Promise.resolve();
            }
            return byCountry();
          },
        )
      : byCountry();

    run
      .then((res) => {
        if (cancelled || !res) return;
        const hits = pick(res);
        setItems(hits);
        setExhausted(hits.length === 0);
      })
      .catch(() => {
        if (!cancelled) setExhausted(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [notice.id, notice.country, notice.notice_type, locale]);

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
          {[0, 1, 2, 3].map((i) => (
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
