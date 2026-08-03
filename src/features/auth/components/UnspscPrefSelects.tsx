/**
 * UNSPSC 行业偏好三级级联选择器
 * UNSPSC Industry Preference Cascade Selects
 *
 * @module features/auth/components/UnspscPrefSelects
 * @description 纯展示组件：依据传入的级联状态与回调渲染三级下拉（前两级必选，
 *              第三级可选）；注册表单与已登录面板共用。
 *              Presentational three-level cascade selects shared by the
 *              register form and the account panel.
 */
import { useLocale } from "@/core/i18n";
import { getUnspscOptionLabel, type UnspscOption } from "@/core/unspsc";
import { Select } from "@/shared/ui";

export interface UnspscPrefSelectsProps {
  industryOptions: UnspscOption[];
  subOptions: UnspscOption[];
  subOptions2: UnspscOption[];
  prefLevel1: string;
  prefLevel2: string;
  prefLevel3: string;
  onLevel1Change: (value: string) => void;
  onLevel2Change: (value: string) => void;
  onLevel3Change: (value: string) => void;
}

/** 三级级联下拉：注册模式与已登录面板共用（前两级必选，第三级可选） */
export function UnspscPrefSelects({
  industryOptions,
  subOptions,
  subOptions2,
  prefLevel1,
  prefLevel2,
  prefLevel3,
  onLevel1Change,
  onLevel2Change,
  onLevel3Change,
}: UnspscPrefSelectsProps) {
  const { t, locale } = useLocale();
  return (
    <>
      <Select
        aria-label={t("authIndustryPrefSelect")}
        value={prefLevel1}
        onChange={(e) => onLevel1Change(e.target.value)}
        className="bg-white"
      >
        <option value="">{t("authIndustryPrefSelect")}</option>
        {industryOptions.map((item) => (
          <option key={item.id} value={item.id}>
            {getUnspscOptionLabel(item, locale)}
          </option>
        ))}
      </Select>
      <Select
        aria-label={t("authIndustryPrefSub")}
        value={prefLevel2}
        onChange={(e) => onLevel2Change(e.target.value)}
        disabled={!prefLevel1}
        className="bg-white"
      >
        <option value="">{t("authIndustryPrefSub")}</option>
        {subOptions.map((item) => (
          <option key={item.id} value={item.id}>
            {getUnspscOptionLabel(item, locale)}
          </option>
        ))}
      </Select>
      <Select
        aria-label={t("authIndustryPrefSub3")}
        value={prefLevel3}
        onChange={(e) => onLevel3Change(e.target.value)}
        disabled={!prefLevel2}
        className="bg-white"
      >
        <option value="">{t("authIndustryPrefSub3")}</option>
        {subOptions2.map((item) => (
          <option key={item.id} value={item.id}>
            {getUnspscOptionLabel(item, locale)}
          </option>
        ))}
      </Select>
    </>
  );
}
