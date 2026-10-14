/**
 * 品目分类树 API 客户端
 * Commodity tree API client
 *
 * @module features/procurement/api/commodityTree
 * @description 商机页五级下拉（中类/小类/子类/品目）的取数口，读品目骨架树。
 *              第一级（32 个大类）不走网络：前端直接用 COMMODITY_GROUPS 常量 + locale 名渲染，
 *              与快筛 chip 同源同序。
 */
import { api, apiCached } from "@/core/http";
import type { CommodityTreeOption } from "@/lib/services/commodity/tree";

export type { CommodityTreeOption };

/** 偏好路径换算结果（骨架节点码 → 大类码 + 各级名称） */
export interface CommodityPrefsPath {
  groupCode: string | null;
  options: CommodityTreeOption[];
}

/** 取某个父节点的下一级选项：parent 为大类的返回所辖中类，为骨架节点码的返回下一级 */
export const fetchCommodityTreeChildren = (parent: string) =>
  apiCached<CommodityTreeOption[]>(`/api/commodity/tree?parent=${encodeURIComponent(parent)}`);

/**
 * 骨架节点码 → 所属大类码（外链只给 ?commodity= 时用来点亮第一级）。
 * 不能前端切片算：L1 码序号不等于大类码序号（实测 32 行只有 5 行相等）。
 */
export const fetchCommodityNodeGroup = (code: string) =>
  apiCached<{ groupCode: string | null }>(`/api/commodity/tree/resolve?code=${encodeURIComponent(code)}`);

/**
 * 把账号行业偏好（UGT 最深节点码 commodity_code）换算成品目树路径（各级名称 + 大类码）。
 * 偏好表已直接存骨架节点码，祖先链由码长纯切片得出；旧版「字典 id 换算」随 UNSPSC
 * 字典退役删除，见 lib/services/commodity/tree.ts 的 resolveCommodityCodeToPath。
 */
export const fetchCommodityPrefsPath = (code: string) =>
  api<CommodityPrefsPath>(
    `/api/commodity/tree/prefs?code=${encodeURIComponent(code)}`,
  );
