/**
 * 品目骨架五级下拉 — 品目大类 → 中类 → 小类 → 子类 → 品目
 * Commodity backbone five-level selector
 *
 * @module features/procurement/components/CommodityLevelSelector
 * @description 取代旧 UnspcsSelector（那五级读的是旧字典旧品类字典表，第一级是 A..J
 *              十个字母容器、名字还是「原材料 材料, 化学品, 纸张, 燃料」这种机器拼接串）。
 *
 *              三处口径纪律：
 *              1. 第一级 = 32 个 L1 大类行，与后续四级同走树接口（levels[0]），名字即树名。
 *                 2026-10-15 G 码退役：不再有常量大类清单与 locale 大类名第二口径——
 *                 树怎么调，第一级就跟着怎么变。不要再加回第二套大类入口。
 *              2. **展示名与数据层是两回事**：占位项用业务语义名（品目大类 / 采购领域 / 业务门类 /
 *                 细分类目 / 具体品目），底下是骨架树的 L1~L5。固定映射：
 *                   品目大类 = L1（32）/ 采购领域 = L2 中类（212）/ 业务门类 = L3 小类（1,175）
 *                   细分类目 = L4 子类（8,004）/ 具体品目 = L5 品目（150,006）
 *                 i18n 键名 commodityLevelSegment/Family/Class/Commodity 是**历史名**（当年底下
 *                 确实是旧品类码四层），换骨架后语义已变但键名不改（键名刚由另一批提交改成业务文案，
 *                 再改名会搅动六语言）——要改就连着六语言一起改成 Level1~5，不要只改一侧。
 *              3. 名称缺失不编造：实测 L2~L4 的 name_en 全空（212 / 1,175 / 8,004 行），L5 双语全量。
 *                 展示按 nameZh → nameEn → key 兜底，所以非中文界面这三层会落到中文名（补译名是独立工作）。
 */
import { useLocale, type LocaleKey } from "@/core/i18n";
import { Select } from "@/shared/ui";
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
  /** 五层选项：[0] = L1 大类行（树接口直出），[1..4] = 中类 / 小类 / 子类 / 品目 */
  levels: CommodityTreeOption[][];
  /** 当前选中键：[大类码, 中类码, 小类码, 子类码, 品目码]，未选为空串 */
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
        const options = levels[level] ?? [];
        // 上一级没选就没有子级可列；选了上一级但子级为空 ⇒ 库里确实没有，不给假选项
        const disabled = level > 0 && !selectedKeys[level - 1];
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
