/**
 * 热门入口标签栏
 * Hot Tag Bar — Quick Access by Country/Industry
 *
 * @module shared/ui/HotTagBar
 * @description 显示热门国家/行业标签 + 结果计数，超出 maxVisible 折叠。
 */
import { useState } from "react";
import { ChevronDown } from "lucide-react";

export interface HotTagItem {
  key: string;
  label: string;
  count: number;
  href: string;
}

export interface HotTagBarProps {
  /** 标签列表 */
  items: HotTagItem[];
  /** 默认可见数量，超出折叠 */
  maxVisible?: number;
  /** 折叠文案 */
  expandLabel?: string;
  collapseLabel?: string;
}

/** 热门入口标签栏 */
export function HotTagBar({
  items,
  maxVisible = 8,
  expandLabel = "更多",
  collapseLabel = "收起",
}: HotTagBarProps) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  const visibleItems = expanded ? items : items.slice(0, maxVisible);
  const hasMore = items.length > maxVisible;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {visibleItems.map((item) => (
        <a
          key={item.key}
          href={item.href}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:border-teal-400 hover:text-teal-700 transition-colors"
        >
          <span className="max-w-[160px] truncate">{item.label}</span>
          <span className="font-bold text-teal-600">{item.count.toLocaleString()}</span>
        </a>
      ))}
      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-teal-600 font-semibold transition-colors"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
          {expanded ? collapseLabel : `${expandLabel} (${items.length - maxVisible})`}
        </button>
      )}
    </div>
  );
}
