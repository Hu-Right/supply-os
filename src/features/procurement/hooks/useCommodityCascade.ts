/**
 * 品目分类五级级联 Hook
 * Commodity five-level cascade hook
 *
 * @module features/procurement/hooks/useCommodityCascade
 * @description 商机页五级下拉（品目大类 → 段 → 族 → 类 → 品目）的选项装载。
 *
 *              与旧 useUnspscCascade 的三处实质差别：
 *              1. **URL 是唯一事实源**：选中态来自 `?group=` 与 `?commodity=`，不再维护一份
 *                 组件内 selectedIds。旧实现里下拉选中态不进 URL，导致分享出去的链接
 *                 「筛了但界面是空的」；而 chip 早就走 URL，两套入口两种状态来源必然漂移。
 *              2. **第一级不请求接口**：32 个大类由 COMMODITY_GROUPS 常量 + locale 名渲染，
 *                 与 chip 同一份清单、同一个顺序、同一套名字。
 *              3. **路径不需要反查**：`commodity=721015` 本身就带着祖先链
 *                 （72 → 7210 → 721015），逐级切片即可确定每一层要问哪个父节点。
 *
 *              取数失败的处理与旧实现相反：旧代码 catch 后静默留空，界面看起来「就是这个大类」；
 *              现在同样留空，但空层会 disabled 且面板上没有假选项，用户不会误以为筛成功了。
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { COMMODITY_GROUPS, groupCodeOfUnspscPrefix } from "@/lib/services/commodity/groups";
import { commodityPathChain } from "@/lib/services/commodity/tree";
import { fetchCommodityTreeChildren, type CommodityTreeOption } from "../api/commodityTree";

export interface CommodityCascade {
  /** 五层选项：[0] 大类由常量渲染故恒为空，[1..4] = 段 / 族 / 类 / 品目 */
  levels: CommodityTreeOption[][];
  /** 当前选中键：[大类码, 段前缀, 族前缀, 类前缀, 品目前缀]，未选为空串 */
  selectedKeys: string[];
}

/** 大类码：URL 没带 group 时，由品目路径的头两位段前缀反查常量得到（外链只给 commodity 也能对齐） */
function resolveGroup(group: string, firstPrefix: string): string {
  if (group) return group;
  return firstPrefix ? groupCodeOfUnspscPrefix(firstPrefix.slice(0, 2)) ?? "" : "";
}

/** `721015` → ["72","7210","721015",""]：祖先链由键自身切片得到（纯函数 commodityPathChain 在 commodity/tree.ts） */
export function useCommodityCascade(): CommodityCascade {
  const searchParams = useSearchParams();
  const rawGroup = searchParams.get("group") || "";
  const commodity = searchParams.get("commodity") || "";
  const chain = useMemo(() => commodityPathChain(commodity), [commodity]);
  const group = useMemo(() => resolveGroup(rawGroup, chain[0]), [rawGroup, chain]);

  const selectedKeys = useMemo(() => [group, ...chain], [group, chain]);
  const [levels, setLevels] = useState<CommodityTreeOption[][]>([[], [], [], [], []]);

  useEffect(() => {
    let cancelled = false;
    // 需要问的父节点：大类→段，段→族，族→类，类→品目（品目层无下级）
    const jobs: Array<{ index: number; parent: string }> = [];
    if (group) jobs.push({ index: 1, parent: group });
    for (let i = 0; i < 3 && chain[i]; i += 1) jobs.push({ index: i + 2, parent: chain[i] });
    if (jobs.length === 0) {
      setLevels((prev) => (prev.some((l) => l.length > 0) ? [[], [], [], [], []] : prev));
      return;
    }
    (async () => {
      const next: CommodityTreeOption[][] = [[], [], [], [], []];
      await Promise.all(
        jobs.map(async ({ index, parent }) => {
          try {
            const rows = await fetchCommodityTreeChildren(parent);
            next[index] = Array.isArray(rows) ? rows : [];
          } catch {
            next[index] = [];
          }
        }),
      );
      if (!cancelled) setLevels(next);
    })();
    return () => { cancelled = true; };
  }, [group, chain]);

  return { levels, selectedKeys };
}

/** 第一级（32 个大类）的清单：与 chip 同一常量，按 sort（实测公告量降序）排列 */
export const COMMODITY_LEVEL1 = COMMODITY_GROUPS;
