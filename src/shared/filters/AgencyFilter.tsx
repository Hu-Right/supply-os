/**
 * 采购机构筛选组件（基于共享 Combobox）
 * Agency Filter Component
 *
 * @module shared/filters/AgencyFilter
 * @description 采购机构可搜索下拉筛选。内部复用 shared/ui/Combobox
 *              （Radix Popover + cmdk），本组件仅负责：
 *              1. 机构数据映射（label 优先 agency_i18n 翻译名，回退英文原名；count 作为 hint）；
 *              2. i18n 文案默认值（无结果提示 / 清除按钮 aria-label）。
 */
import { useMemo } from "react";
import { useLocale } from "@/core/i18n";
import { Combobox, type ComboboxItem } from "@/shared/ui/Combobox";

export interface AgencyFilterItem { agency: string; count: number; agency_i18n?: string; }

export interface AgencyFilterProps {
  agencies: AgencyFilterItem[];
  value: string;
  onChange: (agency: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  noResultsText?: string;
  className?: string;
}

export function AgencyFilter({
  agencies, value, onChange,
  placeholder = "All agencies",
  searchPlaceholder = "Search agency...",
  noResultsText,
  className = "",
}: AgencyFilterProps) {
  const { t } = useLocale();
  const resolvedNoResults = noResultsText ?? t("filterNoMatchAgencies");

  // 机构数据 → Combobox 条目：value 为英文原名（用于搜索与选中匹配，cmdk 同时匹配 value+label），
  // label 优先展示翻译名；count 作为下拉项右侧 hint 展示。
  const items = useMemo<ComboboxItem[]>(
    () =>
      agencies.map((a) => ({
        value: a.agency,
        label: a.agency_i18n || a.agency,
        hint: String(a.count),
      })),
    [agencies],
  );

  return (
    <Combobox
      items={items}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      noResultsText={resolvedNoResults}
      clearLabel={t("filterClearAgency")}
      className={className}
    />
  );
}

AgencyFilter.displayName = "AgencyFilter";
