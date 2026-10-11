/**
 * 品目分类树 API 客户端
 * Commodity tree API client
 *
 * @module features/procurement/api/commodityTree
 * @description 商机页五级下拉（段/族/类/品目）的取数口。第一级（32 个大类）不走网络：
 *              前端直接用 COMMODITY_GROUPS 常量 + locale 名渲染，与快筛 chip 同源同序。
 */
import { api, apiCached } from "@/core/http";
import type { CommodityTreeOption } from "@/lib/services/commodity/tree";

export type { CommodityTreeOption };

/** 旧偏好路径换算结果（字典 id → 品目树键 + 名称） */
export interface CommodityPrefsPath {
  groupCode: string | null;
  options: CommodityTreeOption[];
}

/** 取某个父节点的下一级选项：parent 为大类的返回所辖段，为 UNSPSC 前缀的返回下一级 */
export const fetchCommodityTreeChildren = (parent: string) =>
  apiCached<CommodityTreeOption[]>(`/api/commodity/tree?parent=${encodeURIComponent(parent)}`);

/**
 * 把账号行业偏好（旧字典 crm_unspsc_codes 的行 id）换算成品目树路径。
 * 偏好表存的是 level1~3 的字典 id，而旧字典 level=1 是 10 个字母容器，在新分类里没有对应层，
 * 换算规则与原因见 lib/services/commodity/tree.ts 的 resolveUnspscIdsToCommodityPath。
 */
export const fetchCommodityPrefsPath = (ids: Array<number | null | undefined>) =>
  api<CommodityPrefsPath>(
    `/api/commodity/tree/prefs?ids=${ids.map((v) => Number(v) || 0).join(",")}`,
  );
