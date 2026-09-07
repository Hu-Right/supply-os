/**
 * 高级搜索面板 — 7 维搜索增强
 * Advanced Search Panel — Extended Search Dimensions
 *
 * @module features/procurement/components/AdvancedSearchPanel
 * @description 在现有 NoticeSearchBar（5 维：关键词/截止/机构/国家/类型）基础上
 *              新增金额范围维度，形成 7 维搜索面板。
 *              通过 FEATURE_ADVANCED_SEARCH flag 控制新旧面板切换。
 *              UNSPSC 行业分类沿用现有折叠区域，不重复实现。
 */
import { useState, useCallback, type ReactNode } from "react";
import { DollarSign } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Input } from "@/shared/ui";
import { NoticeSearchBar, type NoticeSearchBarProps } from "./NoticeSearchBar";

export interface AdvancedSearchPanelProps extends NoticeSearchBarProps {
  /** 额外内容插槽（如 UNSPSC 选择器、操作按钮行等） */
  children?: ReactNode;
  /** 金额范围变化回调 */
  onAmountChange?: (min: string, max: string) => void;
}

/** 高级搜索面板 — 包裹 NoticeSearchBar + 金额范围 */
export function AdvancedSearchPanel({
  children,
  onAmountChange,
  ...searchBarProps
}: AdvancedSearchPanelProps) {
  const { t } = useLocale();
  const [valueMin, setValueMin] = useState("");
  const [valueMax, setValueMax] = useState("");

  const handleMinChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/[^\d]/g, "");
    setValueMin(v);
    onAmountChange?.(v, valueMax);
  }, [onAmountChange, valueMax]);

  const handleMaxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/[^\d]/g, "");
    setValueMax(v);
    onAmountChange?.(valueMin, v);
  }, [onAmountChange, valueMin]);

  return (
    <div className="space-y-4">
      {/* 现有搜索栏（5 维：关键词/截止/机构/国家/类型） */}
      <NoticeSearchBar {...searchBarProps} />

      {/* 新增维度：金额范围 */}
      <div className="border-t border-slate-100 pt-3">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className="w-4 h-4 text-teal-600" />
          <span className="text-xs font-bold text-slate-600">{t("procurement_budgetRange") || "预算范围 (USD)"}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-center">
          <Input
            type="text"
            inputMode="numeric"
            value={valueMin}
            onChange={handleMinChange}
            placeholder={t("procurement_budgetMin") || "最低金额"}
            className="w-full"
          />
          <span className="text-xs text-slate-400 font-bold hidden sm:inline">—</span>
          <Input
            type="text"
            inputMode="numeric"
            value={valueMax}
            onChange={handleMaxChange}
            placeholder={t("procurement_budgetMax") || "最高金额"}
            className="w-full"
          />
        </div>
      </div>

      {/* 额外内容（UNSPSC 选择器、操作按钮等） */}
      {children}
    </div>
  );
}
