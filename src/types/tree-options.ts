/**
 * 级联树选项类型（品目树 / 行业树共用形状的单一定义处）
 * Tree option types — single source for commodity & industry cascade options
 *
 * @module types/tree-options
 * @description 2026-10-31 架构收口：此前 CommodityTreeOption 定义在 lib/services/commodity/tree、
 *              IndustryTreeOption 定义在 lib/services/industry-facets，features 里 15 处
 *              为取类型被迫 import @/lib（type-only 泄漏）或跨 feature 引用。两者结构本就同构
 *              （{key,nameZh,nameEn}），收敛为一个 TreeOption，旧名以别名保留兼容。
 *              lib 侧服务继续 re-export 同一类型，服务端消费面不变。
 */

/** 级联树选项：筛选键 = 节点码（UGT-…，码长即层级），双语名（允许空串交展示侧兜底） */
export interface TreeOption {
  key: string;
  nameZh: string;
  nameEn: string;
}

/** 品目树选项（兼容别名，原 lib/services/commodity/tree 导出面） */
export type CommodityTreeOption = TreeOption;

/** 行业树选项（兼容别名，原 lib/services/industry-facets 导出面） */
export type IndustryTreeOption = TreeOption;
