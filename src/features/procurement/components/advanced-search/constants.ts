/**
 * 高级搜索面板的模块级常量（自 AdvancedSearchPanel.tsx 拆出，行为不变）。
 *
 * @module features/procurement/components/advanced-search/constants
 */
import type { TermMode } from "@/shared/utils/advanced-syntax";

/** 公告类型选项（复用现有 notice_type 归一化体系，标签显示为"采购方式"） */
export const NOTICE_TYPE_OPTIONS = [
  { value: "", labelKey: "procurement_noticeTypeAll" as const },
  { value: "ITB", labelKey: "procurement_type_itb" as const },
  { value: "RFQ", labelKey: "procurement_type_rfq" as const },
  { value: "RFP", labelKey: "procurement_type_rfp" as const },
  { value: "EOI", labelKey: "procurement_type_eoi" as const },
  { value: "PQ", labelKey: "procurement_type_prequalification" as const },
  { value: "AWARD", labelKey: "procurement_type_contract_award" as const },
  { value: "GPN", labelKey: "procurement_type_gpn" as const },
  { value: "RFI", labelKey: "procurement_type_rfi" as const },
  { value: "COMPETITIVE", labelKey: "procurement_type_competitive" as const },
  { value: "FRAMEWORK", labelKey: "procurement_type_framework" as const },
  { value: "DIRECT", labelKey: "procurement_type_direct_contracting" as const },
  { value: "RESTRICTED", labelKey: "procurement_type_restricted" as const },
  { value: "PIN", labelKey: "procurement_type_pin" as const },
  { value: "PMC", labelKey: "procurement_type_pmc" as const },
];

/** chip 点击时的模式循环：包含 → 排除 → 精确短语（非「包含」受 advanced_keyword_search 门控） */
export const MODE_CYCLE: TermMode[] = ["include", "exclude", "phrase"];

/** 三色区分模式：图标+颜色即语义，无需额外说明文字占用高度 */
export const MODE_CHIP_STYLE: Record<TermMode, string> = {
  include: "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
  exclude: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
  phrase: "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100",
};
