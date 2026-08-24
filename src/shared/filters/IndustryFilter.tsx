/**
 * 行业筛选组件
 * Industry Filter Component
 *
 * @module shared/filters/IndustryFilter
 * @description 行业下拉筛选
 *              Industry dropdown filter
 */

import { Select } from "@/shared/ui";
import { useLocale } from "@/core/i18n";

export interface IndustryFilterProps {
  /** 行业列表 */
  industries: string[];
  /** 当前选中行业 */
  selectedIndustry: string;
  /** 行业变更回调 */
  onIndustryChange: (industry: string) => void;
  /** 自定义类名 */
  className?: string;
}

export function IndustryFilter({
  industries,
  selectedIndustry,
  onIndustryChange,
  className = "",
}: IndustryFilterProps) {
  const { t } = useLocale();
  return (
    <Select
      value={selectedIndustry}
      onChange={(e) => onIndustryChange(e.target.value)}
      aria-label="选择行业"
      className={`w-40 ${className}`}
    >
      <option value="">{t("allIndustries")}</option>
      {industries.map((industry) => (
        <option key={industry} value={industry}>
          {industry}
        </option>
      ))}
    </Select>
  );
}

IndustryFilter.displayName = "IndustryFilter";
