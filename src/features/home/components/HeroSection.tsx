/**
 * Hero 区 — 搜索入口 + 热门搜索
 * Hero Section — Search entry + real search hot terms
 *
 * @module features/home/components/HeroSection
 * @description 深蓝科技风 Hero，采购机会搜索入口。
 *              2026-11-18 口径切换（用户拍板）：**热门搜索只展示真实检索热度**
 *              （/api/notices/hot-searches：去重访客加权、单访客次数封顶、结果命中率门槛、
 *              参考码/编号类词过滤）。原来混排的「热门国家 / 热门品目」数据覆盖榜已剥离，
 *              不再冒充「热门搜索」；真实数据不足时整行隐藏（宁可空着，不展示数据量榜）。
 *              搜索框提交仍走统一搜索页 /procurement?q=…
 */
import { memo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { useHotSearches, type HotSearchesData } from "../hooks/useHotSearches";
import { Search } from "lucide-react";

/** Hero 区 — 采购机会搜索 + 真实热门搜索标签（纯展示，页面其它区块 state 变化不重渲染） */
export const HeroSection = memo(function HeroSection({
  initialHotSearches,
}: {
  initialHotSearches?: HotSearchesData | null;
} = {}) {
  const router = useRouter();
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const { data: hotSearches } = useHotSearches(initialHotSearches);

  // 只展示真实热词；fallback（数据不足）或空列表 → 整行隐藏
  const hotKeywords = hotSearches?.mode === "hot" ? hotSearches.keywords : [];
  const hasHotKeywords = hotKeywords.length > 0;

  const handleSearch = () => {
    if (query.trim()) {
      router.push(`/procurement?q=${encodeURIComponent(query.trim())}`);
    } else {
      router.push("/procurement");
    }
  };

  return (
    <section className="relative bg-[#0c1929] py-12 w-[calc(100%+2rem)] -ml-4 sm:w-[calc(100%+3rem)] sm:-ml-6 lg:w-[calc(100%+4rem)] lg:-ml-8 overflow-hidden">
      {/* 港口夜景底图（2026-11-13 换）：整幅铺底，左侧压暗托白字，主体留在右半 */}
      <img
        src="/images/home/hero-banner.webp"
        srcSet="/images/home/hero-banner-sm.webp 1600w, /images/home/hero-banner.webp 2200w"
        sizes="100vw"
        alt=""
        aria-hidden
        fetchPriority="high"
        decoding="async"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[74%_center] sm:object-[68%_center] lg:object-center"
      />
      {/* 左侧渐变：窄屏几乎压满（文字占满宽度），桌面收在左半 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0c1929] via-[#0c1929]/85 to-[#0c1929]/15 sm:from-[#0c1929]/95 sm:via-[#0c1929]/70 sm:to-[#0c1929]/0"
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-left">
        {/* 标题区 */}
        <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-2">
          {t("homeHeroTitle")}
        </h1>
        <p className="text-slate-400 text-sm mb-8 max-w-2xl">
          {t("homeHeroDesc")}
        </p>

        {/* 搜索入口 */}
        <div className="bg-[#162236] rounded-xl border border-[#1e3a5f] p-6 max-w-3xl">
          <div className="mb-3">
            <span className="text-white font-bold text-sm">{t("homeSearchLabel")}</span>
          </div>
          <div className="flex">
            {/* min-w-0：flex 子项默认 min-width:auto，输入框会按 placeholder 文本撑开，
                把右侧按钮挤出视口（390px 窄屏实测溢出） */}
            <div className="relative flex-1 min-w-0">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder={t("homeSearchPlaceholder")}
                className="w-full bg-white border border-e-0 border-slate-200 rounded-s-lg ps-9 pe-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={handleSearch}
              className="bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white px-5 py-2.5 rounded-e-lg text-sm font-bold transition-colors whitespace-nowrap border border-teal-600"
            >
              {t("homeSearchBtn")}
            </button>
          </div>
          {/* 热门搜索：只来自真实检索热度；无数据整行不渲染 */}
          {hasHotKeywords && (
            <div className="mt-3 flex flex-wrap items-center gap-1">
              <span className="text-slate-500 text-xs">{t("homeHotSearchLabel")}</span>
              {hotKeywords.map((tag, idx) => (
                <span key={`hot:${tag.term}`} className="inline-flex items-center gap-1">
                  {idx > 0 && <span className="text-slate-600 text-xs">/</span>}
                  <button
                    onClick={() => {
                      router.push(tag.href);
                    }}
                    className="text-xs text-slate-300 hover:text-teal-300 transition-colors"
                  >
                    <span className="inline-block max-w-[200px] truncate align-bottom">{tag.label}</span>
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
});
