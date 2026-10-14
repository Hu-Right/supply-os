/**
 * 品目偏好三级级联选择器（UGT 骨架树）
 * Commodity Preference Cascade Selects
 *
 * @module features/auth/components/CommodityPrefSelects
 * @description 纯展示组件：依据传入的级联状态与回调渲染三级下拉（前两级必选，
 *              第三级可选）；注册表单与已登录面板共用。
 *              Presentational three-level cascade selects shared by the
 *              register form and the account panel.
 *              取代旧 UnspscPrefSelects（读 UNSPSC 字典，随字典退役下线）。
 */
import { useLocale, type LocaleKey } from "@/core/i18n";
import type { CommodityGroup } from "@/lib/services/commodity/groups";
import type { CommodityTreeOption } from "@/features/procurement/api/commodityTree";
import { Select } from "@/shared/ui";

export interface CommodityPrefSelectsProps {
  groupOptions: readonly CommodityGroup[];
  subOptions: CommodityTreeOption[];
  subOptions2: CommodityTreeOption[];
  prefGroup: string;
  prefLevel2: string;
  prefLevel3: string;
  onGroupChange: (value: string) => void;
  onLevel2Change: (value: string) => void;
  onLevel3Change: (value: string) => void;
}

/** 树节点的双语展示名（L1~L3 英文名实测全空，非中文界面落中文名，不编造） */
function nodeLabel(option: CommodityTreeOption, locale: string): string {
  const primary = locale === "zh" ? option.nameZh : option.nameEn;
  const fallback = locale === "zh" ? option.nameEn : option.nameZh;
  return primary || fallback || option.key;
}

/** 三级级联下拉：注册模式与已登录面板共用（前两级必选，第三级可选） */
export function CommodityPrefSelects({
  groupOptions,
  subOptions,
  subOptions2,
  prefGroup,
  prefLevel2,
  prefLevel3,
  onGroupChange,
  onLevel2Change,
  onLevel3Change,
}: CommodityPrefSelectsProps) {
  const { t, locale } = useLocale();
  return (
    <>
      <Select
        aria-label={t("authIndustryPrefSelect")}
        value={prefGroup}
        onChange={(e) => onGroupChange(e.target.value)}
        className="bg-white"
      >
        <option value="">{t("authIndustryPrefSelect")}</option>
        {groupOptions.map((g) => (
          <option key={g.code} value={g.code}>
            {t(`commodityGroup_${g.code}` as LocaleKey)}
          </option>
        ))}
      </Select>
      <Select
        aria-label={t("authIndustryPrefSub")}
        value={prefLevel2}
        onChange={(e) => onLevel2Change(e.target.value)}
        disabled={!prefGroup}
        className="bg-white"
      >
        <option value="">{t("authIndustryPrefSub")}</option>
        {subOptions.map((item) => (
          <option key={item.key} value={item.key}>
            {nodeLabel(item, locale)}
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
          <option key={item.key} value={item.key}>
            {nodeLabel(item, locale)}
          </option>
        ))}
      </Select>
    </>
  );
}
