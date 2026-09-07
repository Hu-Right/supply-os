/**
 * 热门国家/行业/UNSPSC 代码 — 真实计数
 * Hot Topics Section — Real Counts by Country/Industry/UNSPSC
 *
 * @module features/home/components/HotTopicsSection
 * @description 服务端 10 分钟缓存 + HTTP 10 分钟缓存，无需客户端轮询。
 */
import { useState, useEffect } from "react";
import { useLocale } from "@/core/i18n";
import { api } from "@/core/http";
import { getCountryDisplayName } from "@/shared/data/countryNames";

/** 热门国家/行业/UNSPSC 代码 — 真实计数 */
export function HotTopicsSection() {
  const { locale } = useLocale();
  const [topics, setTopics] = useState<{
    countries: Array<{ country: string; count: number }>;
    industries: Array<{ id: number; code: string; title_zh: string; title: string; count: number }>;
    unspsc: Array<{ id: number; code: string; title_zh: string; title: string; count: number }>;
  } | null>(null);

  useEffect(() => {
    // 服务端 10 分钟缓存 + HTTP 10 分钟缓存，无需客户端轮询
    api<NonNullable<typeof topics>>("/api/notices/hot-topics").then(setTopics).catch(() => {});
  }, []);

  if (!topics) return null;

  const industryName = (i: { title_zh: string; title: string }) =>
    locale === "zh" ? i.title_zh || i.title : i.title;

  const groups = [
    {
      label: "热门国家",
      items: topics.countries.map((c) => ({
        key: c.country,
        label: getCountryDisplayName(c.country, locale),
        count: c.count,
        href: `/procurement?country=${encodeURIComponent(c.country)}`,
      })),
    },
    {
      label: "热门行业",
      items: topics.industries.map((i) => ({
        key: String(i.id),
        label: industryName(i),
        count: i.count,
        href: `/procurement?industry_id=${i.id}`,
      })),
    },
    {
      label: "UNSPSC 热门代码",
      items: topics.unspsc.map((i) => ({
        key: String(i.id),
        label: `${i.code} ${industryName(i)}`,
        count: i.count,
        href: `/procurement?code_id=${i.id}`,
      })),
    },
  ].filter((g) => g.items.length > 0);

  if (groups.length === 0) return null;

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-6 border-b border-slate-100">
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.label} className="flex items-start gap-3">
            <span className="shrink-0 w-24 text-xs font-bold text-slate-500 mt-1.5">{g.label}</span>
            <div className="flex flex-wrap gap-2">
              {g.items.map((item) => (
                <a
                  key={item.key}
                  href={item.href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:border-teal-400 hover:text-teal-700 transition-colors"
                >
                  <span className="max-w-[180px] truncate">{item.label}</span>
                  <span className="font-bold text-teal-600">{item.count.toLocaleString()}</span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
