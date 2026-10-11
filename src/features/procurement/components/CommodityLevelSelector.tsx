/**
 * 品目分类五级下拉 — 品目大类 → 段 → 族 → 类 → 品目
 * Commodity five-level selector
 *
 * @module features/procurement/components/CommodityLevelSelector
 * @description 取代旧 UnspcsSelector（那五级读的是旧字典 crm_unspsc_codes，第一级是 A..J
 *              十个字母容器、名字还是「原材料 材料, 化学品, 纸张, 燃料」这种机器拼接串）。
 *
 *              三处口径纪律：
 *              1. 第一级就是 32 个大类的唯一入口（类表取唯一事实源常量 COMMODITY_GROUPS）。
 *                 上方曾有一行同源的快筛 chip，与这里完全重叠，已下线；不要再加回第二套大类入口。
 *              2. **展示名与数据层是两回事**：占位项用业务语义名（品目大类 / 采购领域 / 业务门类 /
 *                 细分类目 / 具体品目），而底下仍是 UNSPSC 四层。固定映射：
 *                   采购领域 = segment（58）/ 业务门类 = family（559）
 *                   细分类目 = class（8,004）/ 具体品目 = commodity（150,006）
 *                 i18n 键名保持 UNSPSC 语义（commodityLevelSegment 等），**不要靠中文词反推数据层**；
 *                 也不得改成「中类 / 小类」——那是 crm_commodity_backbone 的另一套五级（212 / 1,175）。
 *              3. 名称缺失按 nameZh → nameEn → 前缀键兜底：品目层实测 63,422/150,006 无中文名
 *                 （英文名全量非空），宁可显示英文标准名，也不显示空白或编一个。
 */
import { useLocale, type LocaleKey } from "@/core/i18n";
import { Select } from "@/shared/ui";
import { COMMODITY_LEVEL1 } from "../hooks/useCommodityCascade";
import type { CommodityTreeOption } from "../api/commodityTree";

/** 五层的层级名（占位项文案） */
const LEVEL_LABEL_KEYS: LocaleKey[] = [
  "procurement_commodityLevelGroup",
  "procurement_commodityLevelSegment",
  "procurement_commodityLevelFamily",
  "procurement_commodityLevelClass",
  "procurement_commodityLevelCommodity",
];

/** 树节点的双语展示名 */
function nodeLabel(option: CommodityTreeOption, locale: string): string {
  const primary = locale === "zh" ? option.nameZh : option.nameEn;
  const fallback = locale === "zh" ? option.nameEn : option.nameZh;
  return primary || fallback || option.key;
}

export interface CommodityLevelSelectorProps {
  /** 五层选项：[0] 由常量渲染故不使用，[1..4] = 段 / 族 / 类 / 品目 */
  levels: CommodityTreeOption[][];
  /** 当前选中键：[大类码, 段, 族, 类, 品目]，未选为空串 */
  selectedKeys: string[];
  /** 某一层的选中变更（key 为空串表示清空该层） */
  onChange: (level: number, key: string) => void;
}

export function CommodityLevelSelector({ levels, selectedKeys, onChange }: CommodityLevelSelectorProps) {
  const { t, locale } = useLocale();

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 md:gap-4">
      {LEVEL_LABEL_KEYS.map((labelKey, level) => {
        const value = selectedKeys[level] ?? "";
        if (level === 0) {
          return (
            <div key={labelKey} className="min-w-0">
              <Select value={value} onChange={(e) => onChange(0, e.target.value)}>
                <option value="">{t(labelKey)}</option>
                {COMMODITY_LEVEL1.map((g) => (
                  <option key={g.code} value={g.code}>
                    {t(`commodityGroup_${g.code}` as LocaleKey)}
                  </option>
                ))}
              </Select>
            </div>
          );
        }
        const options = levels[level] ?? [];
        // 上一级没选就没有子级可列；选了上一级但子级为空 ⇒ 库里确实没有，不给假选项
        const disabled = level > 1 && !selectedKeys[level - 1];
        return (
          <div key={labelKey} className="min-w-0">
            <Select
              value={value}
              disabled={disabled || options.length === 0}
              onChange={(e) => onChange(level, e.target.value)}
            >
              <option value="">{t(labelKey)}</option>
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {nodeLabel(o, locale)}
                </option>
              ))}
            </Select>
          </div>
        );
      })}
    </div>
  );
}
