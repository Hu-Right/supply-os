/**
 * 品目大类 chip 行 — 32 个大类的单选快筛
 * Commodity Group Chips
 *
 * @module features/procurement/components/CommodityGroupChips
 * @description 数据源与口径纪律：
 *              - 类表来自唯一事实源常量 COMMODITY_GROUPS（32 类，按实测公告量降序 = sort），
 *                不在组件里维护第二份清单；
 *              - 展示名走 locale 键 commodityGroup_<大类码>（六语言），键缺失时 i18next 会
 *                直接回显键名（可见降级），不会静默显示别类的名字；
 *              - 点击只写 URL 参数 group=UGT-G-xx，真正的筛选语义在服务端 filter-builder 里
 *                （Meili level2_id OR ↔ MySQL FIND_IN_SET(?, unspsc_level2) 双方言同一谓词），
 *                组件不做任何本地过滤，避免前后端两套命中口径。
 *              排布：默认露出前 16 类（按 sort = 实测公告量降序），其余折叠在「展开全部」里 ——
 *              32 个 chip 平铺会把筛选面板顶成一屏高，且小屏下几乎点不到尾部类。
 */
import { useState } from "react";
import { useLocale, type LocaleKey } from "@/core/i18n";
import { COMMODITY_GROUPS } from "@/lib/services/commodity/groups";
import { Button } from "@/shared/ui";

/** 折叠态露出的类数（按 sort 即公告量降序取前 N） */
const PREVIEW_COUNT = 16;

export function CommodityGroupChips({
  activeGroup,
  onToggle,
}: {
  activeGroup: string;
  onToggle: (code: string) => void;
}) {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);

  const visible = expanded ? COMMODITY_GROUPS : COMMODITY_GROUPS.slice(0, PREVIEW_COUNT);

  return (
    <div className="flex flex-wrap gap-1.5" data-testid="commodity-group-chips">
      {visible.map((g) => {
        const active = activeGroup === g.code;
        return (
          <button
            key={g.code}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(g.code)}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
              active
                ? "border-teal-500 bg-teal-50 text-teal-800 font-bold"
                : "border-slate-200 bg-white text-slate-600 hover:border-teal-400 hover:text-teal-700"
            }`}
          >
            {t(`commodityGroup_${g.code}` as LocaleKey)}
          </button>
        );
      })}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setExpanded((v) => !v)}
        className="px-2 text-xs text-slate-500 hover:text-teal-700"
      >
        {expanded ? t("procurement_collapseCommodityGroups") : t("procurement_expandCommodityGroups")}
      </Button>
    </div>
  );
}
