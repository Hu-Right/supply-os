/**
 * 行业四级级联下拉 — 门类 → 大类 → 中类 → 小类
 * Industry backbone four-level selector
 *
 * @module features/supplier/pages/SupplierPage/IndustryLevelSelector
 * @description 供应商页行业筛选的展示层，交互形态对齐商机页的品目五级下拉（CommodityLevelSelector），
 *              但底层是行业树（UGT-I），不是公告侧的品目骨架树。四级的业务语义：
 *                门类(section) / 大类(division) / 中类(group) / 小类(subclass)（GB/T 4754 四级）。
 *
 *              三处口径纪律（与商机页同源）：
 *              1. 四级都是完整分类树：门类由 /api/industries/facets 下发，子级由 /api/industries/tree 下发，
 *                 零挂靠节点同样可选（选中后正常出「无结果」）；门类未落定前整行禁用，不铺假选项。
 *              2. 上一级没选就没有子级可列（disabled）；选了上一级但子级为空 ⇒ 库里确实没有，
 *                 不给假选项。清空某一级即退回上一级（由 onChange 在 hook 侧处理）。
 *              3. 名称缺失不编造：展示按 nameZh → nameEn → key 兜底（英文侧部分层级译名待补，
 *                 补译名是独立工作，不在这里造数据）。
 */
import { useLocale, type LocaleKey } from "@/core/i18n";
import { Select } from "@/shared/ui";
import type { IndustryTreeOption } from "../../api";

/** 四级的层级名（占位项文案） */
const LEVEL_LABEL_KEYS: LocaleKey[] = [
  "supplierIndustryLevelSection",
  "supplierIndustryLevelDivision",
  "supplierIndustryLevelGroup",
  "supplierIndustryLevelSubclass",
];

/** 树节点的双语展示名 */
function nodeLabel(option: IndustryTreeOption, locale: string): string {
  const primary = locale === "zh" ? option.nameZh : option.nameEn;
  const fallback = locale === "zh" ? option.nameEn : option.nameZh;
  return primary || fallback || option.key;
}

export interface IndustryLevelSelectorProps {
  /** 四级选项：[0]=门类，[1]=大类，[2]=中类，[3]=小类 */
  levels: IndustryTreeOption[][];
  /** 当前选中链：[门类码, 大类码, 中类码, 小类码]，未选为空串 */
  selectedKeys: string[];
  /** 某一级的选中变更（code 为空串表示清空该级） */
  onChange: (level: number, code: string) => void;
  /** 门类一层是否已落定：未落定整行禁用，避免闪出一排空下拉 */
  loaded: boolean;
}

export function IndustryLevelSelector({ levels, selectedKeys, onChange, loaded }: IndustryLevelSelectorProps) {
  const { t, locale } = useLocale();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      {LEVEL_LABEL_KEYS.map((labelKey, level) => {
        const value = selectedKeys[level] ?? "";
        const options = levels[level] ?? [];
        // 门类未落定 → 整行禁用；子级需先选上一级，且无子级时不给假选项
        const disabled = !loaded || (level > 0 && (!selectedKeys[level - 1] || options.length === 0));
        return (
          <div key={labelKey} className="min-w-0">
            <Select
              value={value}
              disabled={disabled}
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
