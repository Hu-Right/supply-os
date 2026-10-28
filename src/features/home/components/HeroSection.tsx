/**
 * Hero 区 — 单搜索入口
 * Hero Section — Single Search Entry
 *
 * @module features/home/components/HeroSection
 * @description 深蓝科技风 Hero，采购机会搜索入口。
 *              背景与导航栏连为一体，地球装饰在右侧。
 *              热门标签数据由 useHotTopics hook 统一提供。
 *
 *              2026-10-22 路由口径修复（为什么必须改）：旧代码把国家与品类大类标签
 *              一律塞进 ?q=<文本> 做全文关键词检索 —— 大类标签明明携带着 L1 树码
 *              （hot-topics 聚合注释写死「code = 前端拼筛选链接」），点进去却变成
 *              「标题含这几个字的公告」，与标签标称的大类结果数（同一包含关系聚合）
 *              对不上。现在按数据类型分流：
 *              - 品类大类 → hotGroupView 的 ?commodity=<L1 码>（与首页热门品目行同一份口径，
 *                检索侧落在 backbone_path 包含谓词，标称数 = 兑现数）；
 *              - 国家 → ?country=<canonical>（country_aliases 表驱动 ISO2 谓词；
 *                canonical 名白名单内自指 alias 行实测全命中，无码即空集的纪律不会误伤）；
 *              - 数据未返回的兜底国家 → 无 canonical 可筛，诚实保持 ?q= 关键词。
 *              URL 携带筛选值、展示走本地化名（两者分离）；点击不再回填搜索框，
 *              筛选态与关键词态不互相污染。
 */
import { memo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { getCountryDisplayName } from "@/shared/data/countryNames";
import { useHotTopics, hotGroupView } from "../hooks/useHotTopics";
import { Search } from "lucide-react";

/** 单个热标签：展示名与跳转链接分离（href 携带的是筛选谓词参数，不是展示文案） */
interface HotTagItem {
  key: string;
  label: string;
  href: string;
}

/** Hero 区 — 采购机会搜索 + 热门标签（纯展示，页面其它区块 state 变化不重渲染） */
export const HeroSection = memo(function HeroSection() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const [query, setQuery] = useState("");
  const { topics: hotTags } = useHotTopics();

  // 兜底（聚合未返回）：没有 canonical 也没有 L1 码，只能诚实走关键词
  const fallbackCountries = ["肯尼亚", "美国", "联合国", "菲律宾"];
  // 热门标签分流（口径定义见文件头）：大类链接复用 hotGroupView 的 href，
  // 不在本组件重新拼第二份 ?commodity= 字符串
  const hotTags_list: HotTagItem[] = hotTags
    ? [
        ...hotTags.countries.slice(0, 4).map((c) => ({
          key: `country:${c.country}`,
          label: getCountryDisplayName(c.country, locale),
          href: `/procurement?country=${encodeURIComponent(c.country)}`,
        })),
        ...hotGroupView(hotTags.industries.slice(0, 4)).map((g) => ({
          key: `commodity:${g.key}`,
          label: g.label,
          href: g.href,
        })),
      ]
    : fallbackCountries.map((name) => ({
        key: `fallback:${name}`,
        label: name,
        href: `/procurement?q=${encodeURIComponent(name)}`,
      }));

  const handleSearch = () => {
    if (query.trim()) {
      router.push(`/procurement?q=${encodeURIComponent(query.trim())}`);
    } else {
      router.push("/procurement");
    }
  };

  return (
    <section className="relative bg-[#0c1929] py-12 w-[calc(100%+2rem)] -ml-4 sm:w-[calc(100%+3rem)] sm:-ml-6 lg:w-[calc(100%+4rem)] lg:-ml-8 overflow-hidden">
      {/* 地球装饰背景图 */}
      <img
        src="/earth.png?v=2"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -right-[5%] top-1/2 -translate-y-1/2 h-[160%] w-auto object-contain opacity-40 hidden lg:block brightness-150 contrast-125"
        style={{
          maskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.2) 15%, black 40%)",
          WebkitMaskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.2) 15%, black 40%)",
        }}
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
          <div className="flex mb-3">
            <div className="relative flex-1">
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
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-slate-500 text-xs">{t("homeHotSearchLabel")}</span>
            {hotTags_list.map((tag, idx) => (
              <span key={tag.key} className="inline-flex items-center gap-1">
                {idx > 0 && <span className="text-slate-600 text-xs">/</span>}
                <button
                  onClick={() => {
                    router.push(tag.href);
                  }}
                  className="text-xs text-slate-300 hover:text-teal-300 transition-colors"
                >
                  {tag.label}
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
});
