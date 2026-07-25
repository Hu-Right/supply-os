/**
 * 地区筛选组件
 * Region Filter Component
 *
 * @module shared/filters/RegionFilter
 * @description 地区 → 国家联动筛选
 *              Region → Country cascading filter
 */

import { Select } from "@/shared/ui";

export interface RegionFilterProps {
  /** 地区列表 */
  regions: string[];
  /** 当前选中地区 */
  selectedRegion: string;
  /** 地区变更回调 */
  onRegionChange: (region: string) => void;
  /** 国家列表（根据地区联动） */
  countries?: string[];
  /** 当前选中国家 */
  selectedCountry?: string;
  /** 国家变更回调 */
  onCountryChange?: (country: string) => void;
  /** 自定义类名 */
  className?: string;
}

export function RegionFilter({
  regions,
  selectedRegion,
  onRegionChange,
  countries = [],
  selectedCountry = "",
  onCountryChange,
  className = "",
}: RegionFilterProps) {
  return (
    <div className={`flex gap-2 ${className}`}>
      <Select
        value={selectedRegion}
        onChange={(e) => onRegionChange(e.target.value)}
        aria-label="选择地区"
        className="w-32"
      >
        <option value="">全部地区</option>
        {regions.map((region) => (
          <option key={region} value={region}>
            {region}
          </option>
        ))}
      </Select>

      {countries.length > 0 && onCountryChange && (
        <Select
          value={selectedCountry}
          onChange={(e) => onCountryChange(e.target.value)}
          aria-label="选择国家"
          className="w-32"
        >
          <option value="">全部国家</option>
          {countries.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}

RegionFilter.displayName = "RegionFilter";
