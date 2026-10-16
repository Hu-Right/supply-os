/**
 * 关键词标签 chip（自 AdvancedSearchPanel.tsx 拆出）— 方案 B：用一个输入框承载全部关键词，
 * 替代旧版「一行 Input + 一行 Select」的行列表（旧结构 8 行约 380px 纵向空间）。
 * 点标签本体循环切换模式（仍走 handleRowMode 权益门控，转化入口不丢），点 × 删除。
 *
 * 拆分时的唯一接口变化（为让 memo 真实生效）：onCycle/onRemove 由「父侧每 chip 内联闭包」
 * 改为「父侧稳定回调 + 本组件回传自身 row」——此前每次父渲染为每个 chip 新建函数，
 * memo 必然击穿。data-testid 与交互行为逐字保留（e2e advanced-search.spec 依赖）。
 *
 * @module features/procurement/components/advanced-search/KeywordChip
 */
import { memo } from "react";
import { Plus, Minus, Quote, X } from "lucide-react";
import type { TermMode, TermRow } from "@/shared/utils/advanced-syntax";
import { MODE_CHIP_STYLE } from "./constants";

/** 三色区分模式：图标+颜色即语义，无需额外说明文字占用高度 */
function ModeGlyph({ mode }: { mode: TermMode }) {
  if (mode === "exclude") return <Minus className="w-3 h-3 shrink-0" />;
  if (mode === "phrase") return <Quote className="w-3 h-3 shrink-0" />;
  return <Plus className="w-3 h-3 shrink-0" />;
}

export const KeywordChip = memo(function KeywordChip({
  row,
  modeLabel,
  cycleTitle,
  removeLabel,
  onCycle,
  onRemove,
}: {
  row: TermRow;
  modeLabel: string;
  cycleTitle: string;
  removeLabel: string;
  onCycle: (row: TermRow) => void;
  onRemove: (row: TermRow) => void;
}) {
  return (
    <span
      data-testid={`kw-chip-${row.id}`}
      className={`inline-flex items-center rounded-md border text-xs font-bold transition-colors ${MODE_CHIP_STYLE[row.mode]}`}
    >
      <button
        type="button"
        onClick={() => onCycle(row)}
        title={cycleTitle}
        aria-label={`${row.term} · ${modeLabel}`}
        className="inline-flex items-center gap-1 max-w-[11rem] ps-2 py-1.5 rounded-s-md outline-none focus-visible:ring-1 focus-visible:ring-teal-400"
      >
        <ModeGlyph mode={row.mode} />
        <span className="truncate">{row.term}</span>
      </button>
      <button
        type="button"
        data-testid={`kw-chip-remove-${row.id}`}
        onClick={() => onRemove(row)}
        aria-label={removeLabel}
        className="px-1.5 py-1.5 rounded-e-md opacity-50 hover:opacity-100 outline-none"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
});
