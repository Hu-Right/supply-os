/**
 * 品目分类树 API 客户端
 * Commodity tree API client
 *
 * @module features/procurement/api/commodityTree
 * @description 商机页五级下拉（大类/中类/小类/子类/品目）的取数口，读品目骨架树。
 *              2026-10-15 G 码退役：第一级（32 个 L1 大类行）也走本口（parent 为空直出），
 *              名字即树名，与后续各级同源；不再有大类常量第二口径。
 */
import { api, apiCached } from "@/core/http";
import type { CommodityTreeOption } from "@/lib/services/commodity/tree";

export type { CommodityTreeOption };

/** 偏好路径换算结果（骨架节点码 → 所属 L1 大类码 + 各级名称） */
export interface CommodityPrefsPath {
  l1Code: string | null;
  options: CommodityTreeOption[];
}

/** 取某个父节点的下一级选项：parent 为空返回 32 个 L1 大类行，为骨架节点码的返回下一级 */
export const fetchCommodityTreeChildren = (parent: string) =>
  apiCached<CommodityTreeOption[]>(`/api/commodity/tree?parent=${encodeURIComponent(parent)}`);

/**
 * 把账号行业偏好（UGT 最深节点码 commodity_code）换算成品目树路径（各级名称 + 所在 L1 大类码）。
 * 偏好表已直接存骨架节点码，祖先链由码长纯切片得出；旧版「字典 id 换算」随旧品类码
 * 字典退役删除，见 lib/services/commodity/tree.ts 的 resolveCommodityCodeToPath。
 */
export const fetchCommodityPrefsPath = (code: string) =>
  api<CommodityPrefsPath>(
    `/api/commodity/tree/prefs?code=${encodeURIComponent(code)}`,
  );
