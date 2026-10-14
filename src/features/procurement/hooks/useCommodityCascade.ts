/**
 * 品目骨架五级级联 Hook
 * Commodity backbone five-level cascade hook
 *
 * @module features/procurement/hooks/useCommodityCascade
 * @description 商机页五级下拉（品目大类 → 中类 → 小类 → 子类 → 品目）的选项装载，读骨架节点码。
 *
 *              与旧 旧级联 hook 的三处实质差别：
 *              1. **URL 是唯一事实源**：选中态来自 `?group=` 与 `?commodity=`，不再维护一份
 *                 组件内 selectedIds。旧实现里下拉选中态不进 URL，导致分享出去的链接
 *                 「筛了但界面是空的」；而 chip 早就走 URL，两套入口两种状态来源必然漂移。
 *              2. **第一级不请求接口**：32 个大类由 COMMODITY_GROUPS 常量 + locale 名渲染，
 *                 与 chip 同一份清单、同一个顺序、同一套名字。
 *              3. **路径不需要逐层反查**：`commodity=UGT-010101` 本身就带着祖先链
 *                 （门禁 BB1 钉住「父码 = 自身码去掉末两位」），逐级截断即得每一层要问哪个父节点。
 *
 *              一处必须回表的例外：大类码不能由节点码算出来 —— 实测 32 个 L1 行只有 5 行的
 *              码序号等于大类码序号（`UGT-01` 的 `group_code` 是 `UGT-G-11`），所以外链只给
 *              `?commodity=` 时要点亮第一级，就向 /api/commodity/tree/resolve 点查一次。
 *
 *              取数失败的处理与旧实现相反：旧代码 catch 后静默留空，界面看起来「就是这个大类」；
 *              现在同样留空，但空层会 disabled 且面板上没有假选项，用户不会误以为筛成功了。
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { COMMODITY_GROUPS } from "@/lib/services/commodity/groups";
import { commodityNodeChain } from "@/lib/services/commodity/tree";
import { fetchCommodityNodeGroup, fetchCommodityTreeChildren, type CommodityTreeOption } from "../api/commodityTree";

export interface CommodityCascade {
  /** 五层选项：[0] 大类由常量渲染故恒为空，[1..4] = 中类 / 小类 / 子类 / 品目 */
  levels: CommodityTreeOption[][];
  /** 当前选中键：[大类码, 中类码, 小类码, 子类码, 品目码]，未选为空串 */
  selectedKeys: string[];
}

/** 五层空数组的初值（每层一个桶） */
const EMPTY_LEVELS = (): CommodityTreeOption[][] => [[], [], [], [], []];

export function useCommodityCascade(): CommodityCascade {
  const searchParams = useSearchParams();
  const rawGroup = searchParams.get("group") || "";
  const commodity = searchParams.get("commodity") || "";
  // [L1, L2, L3, L4, L5]：非法键全空，宁可不点亮也不拿错键去筛
  const chain = useMemo(() => commodityNodeChain(commodity), [commodity]);

  // 外链只给 commodity 没给 group 时，第一级的大类码要问一次库（纯字符串推不出来）
  const [resolvedGroup, setResolvedGroup] = useState("");
  useEffect(() => {
    if (rawGroup || !chain[0]) {
      setResolvedGroup("");
      return;
    }
    let cancelled = false;
    fetchCommodityNodeGroup(chain[0])
      .then((r) => { if (!cancelled) setResolvedGroup(r?.groupCode ?? ""); })
      .catch(() => { if (!cancelled) setResolvedGroup(""); }); // 拿不到就空着：不拿猜出来的大类点亮界面
    return () => { cancelled = true; };
  }, [rawGroup, chain]);

  const group = rawGroup || resolvedGroup;
  // 第一级显示大类码（与 chip 同一套值），其后四级显示各层节点码；chain[0] 与大类同源故不重复占位
  const selectedKeys = useMemo(() => [group, chain[1], chain[2], chain[3], chain[4]], [group, chain]);
  const [levels, setLevels] = useState<CommodityTreeOption[][]>(EMPTY_LEVELS);

  useEffect(() => {
    let cancelled = false;
    // 需要问的父节点：大类→中类，中类→小类，小类→子类，子类→品目（品目层无下级）
    const jobs: Array<{ index: number; parent: string }> = [];
    if (group) jobs.push({ index: 1, parent: group });
    for (let i = 1; i < 4; i += 1) if (chain[i]) jobs.push({ index: i + 1, parent: chain[i] });
    if (jobs.length === 0) {
      setLevels((prev) => (prev.some((l) => l.length > 0) ? EMPTY_LEVELS() : prev));
      return;
    }
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
  }, [group, chain]);

  return { levels, selectedKeys };
}

/** 第一级（32 个大类）的清单：与 chip 同一常量，按 sort（实测公告量降序）排列 */
export const COMMODITY_LEVEL1 = COMMODITY_GROUPS;
