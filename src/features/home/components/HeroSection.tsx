/**
 * Hero 区 — 单搜索入口
 * Hero Section — Single Search Entry
 *
 * @module features/home/components/HeroSection
 * @description 深蓝科技风 Hero，采购机会搜索入口。
 *              背景与导航栏连为一体，地球装饰在右侧。
 *              热门标签数据由 useHotTopics hook 统一提供。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { getCountryDisplayName } from "@/shared/data/countryNames";
import { useHotTopics } from "../hooks/useHotTopics";
import { Search } from "lucide-react";

/** Hero 区 — 采购机会搜索 + 热门标签 */
export function HeroSection() {
  const router = useRouter();
  const { locale } = useLocale();
  const [query, setQuery] = useState("");
  const { topics: hotTags } = useHotTopics();

  const fallbackCountries = ["肯尼亚", "美国", "联合国", "菲律宾"];
  const hotTags_list = hotTags
    ? [
        ...hotTags.countries.slice(0, 4).map((c) => getCountryDisplayName(c.country, locale)),
        ...hotTags.industries.slice(0, 4).map((i) => locale === "zh" ? i.title_zh || i.title : i.title),
      ]
    : fallbackCountries;

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
          全球公共采购与跨境供应链机会平台
        </h1>
        <p className="text-slate-400 text-sm mb-8 max-w-2xl">
          第一屏必须同时回答：这里有多少订单、多少供应商，我能立刻做什么。
        </p>

        {/* 搜索入口 */}
        <div className="bg-[#162236] rounded-xl border border-[#1e3a5f] p-6 max-w-3xl">
          <div className="mb-3">
            <span className="text-white font-bold text-sm">搜索采购机会</span>
            <span className="text-slate-500 text-xs ml-1">（招标 / 采购 / 项目）</span>
          </div>
          <div className="flex mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="搜索采购主题 / 产品关键词 / UNSPSC / 地区 / 采购机构"
                className="w-full bg-white border border-r-0 border-slate-200 rounded-l-lg pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={handleSearch}
              className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-r-lg text-sm font-bold transition-colors whitespace-nowrap border border-teal-600"
            >
              搜索商机
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-500 text-xs">热门搜索：</span>
            {hotTags_list.map((tag) => (
              <button
                key={tag}
                onClick={() => {
                  setQuery(tag);
                  router.push(`/procurement?q=${encodeURIComponent(tag)}`);
                }}
                className="text-xs text-white hover:text-teal-300 transition-colors"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
