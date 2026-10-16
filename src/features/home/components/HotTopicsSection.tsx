/**
 * 热门品目大类 — 真实计数
 * Hot Topics Section — Real Counts by Commodity Group
 *
 * @module features/home/components/HotTopicsSection
 * @description 消费 useHotTopics hook，纯展示组件。
 *              服务端 10 分钟缓存 + HTTP 10 分钟缓存，无需客户端轮询。
 *              名字与链接都由 hotGroupView 给出（两个组件共用一份），本组件不拼口径。
 */
import { memo } from "react";
import { useLocale } from "@/core/i18n";
import { useHotTopics, hotGroupView } from "../hooks/useHotTopics";

/** 热门品目大类 — 真实计数（展示组件，memo 隔离父层重渲染） */
export const HotTopicsSection = memo(function HotTopicsSection() {
  const { t } = useLocale();
  const { topics } = useHotTopics();

  if (!topics || !topics.industries?.length) return null;

  const items = hotGroupView(topics.industries);
  // 全部是不认识的码（常量与库分叉）：整行不渲染，不给一个空盒子当「热门品目」
  if (items.length === 0) return null;

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-6 border-b border-slate-100">
      <div className="max-w-[1600px] mx-auto flex items-start gap-3">
        <span className="shrink-0 w-24 text-xs font-bold text-slate-500 mt-1.5">{t("homeHotCommodities")}</span>
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
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
    </section>
  );
});
