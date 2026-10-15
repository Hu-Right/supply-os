/**
 * 品目骨架五级级联 Hook
 * Commodity backbone five-level cascade hook
 *
 * @module features/procurement/hooks/useCommodityCascade
 * @description 商机页五级下拉（品目大类 → 中类 → 小类 → 子类 → 品目）的选项装载，读骨架节点码。
 *
 *              与旧级联 hook 的三处实质差别：
 *              1. **URL 是唯一事实源**：选中态来自 `?commodity=`（2026-10-15 起 group 参数
 *                 随 G 码退役并入此键），不再维护一份组件内 selectedIds。旧实现里下拉选中态
 *                 不进 URL，导致分享出去的链接「筛了但界面是空的」。
 *              2. **五级同源同树**：第一级（32 个 L1 大类行）也走树接口（parent 为空直出），
 *                 名字即树名——树怎么调，第一级就跟着怎么变，不再有常量第二口径。
 *              3. **路径不需要逐层反查**：`commodity=UGT-010101` 本身就带着祖先链
 *                 （门禁 BB1 钉住「父码 = 自身码去掉末两位」），逐级截断即得每一层要问哪个父节点；
 *                 第一级键 = 链第一位，G 码时代「大类码要点查反查」的例外整个消失。
 *
 *              取数失败的处理与旧实现相反：旧代码 catch 后静默留空，界面看起来「就是这个大类」；
 *              现在同样留空，但空层会 disabled 且面板上没有假选项，用户不会误以为筛成功了。
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { commodityNodeChain } from "@/lib/services/commodity/tree";
import { fetchCommodityTreeChildren, type CommodityTreeOption } from "../api/commodityTree";

export interface CommodityCascade {
  /** 五层选项：[0] = L1 大类行（树接口直出），[1..4] = 中类 / 小类 / 子类 / 品目 */
  levels: CommodityTreeOption[][];
  /** 当前选中键：[L1 大类码, 中类码, 小类码, 子类码, 品目码]，未选为空串 */
  selectedKeys: string[];
}

/** 五层空数组的初值（每层一个桶） */
const EMPTY_LEVELS = (): CommodityTreeOption[][] => [[], [], [], [], []];

export function useCommodityCascade(): CommodityCascade {
  const searchParams = useSearchParams();
  const commodity = searchParams.get("commodity") || "";
  // [L1, L2, L3, L4, L5]：非法键全空，宁可不点亮也不拿错键去筛
  const chain = useMemo(() => commodityNodeChain(commodity), [commodity]);

  // 第一级显示 L1 大类码（树行 key），其后四级显示各层节点码；chain[0] 即所属大类
  const selectedKeys = useMemo(
    () => [chain[0], chain[1], chain[2], chain[3], chain[4]],
    [chain],
  );
  const [levels, setLevels] = useState<CommodityTreeOption[][]>(EMPTY_LEVELS);

  useEffect(() => {
    let cancelled = false;
    // 第一级 = 32 个 L1 大类行（树接口 parent 为空直出）；其余层按选中父节点逐级取
    const jobs: Array<{ index: number; parent: string }> = [{ index: 0, parent: "" }];
    // 需要问的父节点：大类→中类，中类→小类，小类→子类，子类→品目（品目层无下级）
    for (let i = 0; i < 4; i += 1) if (chain[i]) jobs.push({ index: i + 1, parent: chain[i] });
    (async () => {
      const next = EMPTY_LEVELS();
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
  }, [chain]);

  return { levels, selectedKeys };
}
