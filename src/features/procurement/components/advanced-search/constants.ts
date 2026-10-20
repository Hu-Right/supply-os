/**
 * 高级搜索面板的模块级常量（自 AdvancedSearchPanel.tsx 拆出，行为不变）。
 *
 * @module features/procurement/components/advanced-search/constants
 */
import type { TermMode } from "@/shared/utils/advanced-syntax";
import { NOTICE_TYPE_FILTER_OPTIONS } from "@/shared/utils/notice-type";

/**
 * 公告类型选项（复用现有 notice_type 归一化体系，标签显示为"采购方式"）。
 * 唯一数据源：由 shared/utils/notice-type 的 NOTICE_TYPE_FILTER_OPTIONS 派生，
 * 值取自标准码、标签取自 CODE_TO_LOCALE_KEY，杜绝手写枚举与归一化体系漂移
 *（如旧值 "DIRECT" 非标准码、归一化落 OTHER 致筛选静默失效，现为 "DIRECT_CONTRACTING"）。
 */
export const NOTICE_TYPE_OPTIONS = NOTICE_TYPE_FILTER_OPTIONS;

/** chip 点击时的模式循环：包含 → 排除 → 精确短语（非「包含」受 advanced_keyword_search 门控） */
export const MODE_CYCLE: TermMode[] = ["include", "exclude", "phrase"];

/** 三色区分模式：图标+颜色即语义，无需额外说明文字占用高度 */
export const MODE_CHIP_STYLE: Record<TermMode, string> = {
  include: "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
  exclude: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
  phrase: "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100",
};
