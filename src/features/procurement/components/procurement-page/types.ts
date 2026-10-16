"use client";

/**
 * 采购列表页区块的共享状态类型（自 useNoticeSearch/useCommodityCascade 形状推导，
 * 避免子组件与 hook 返回结构脱钩；类型级引用，无运行时依赖）。
 *
 * @module features/procurement/components/procurement-page/types
 */
import type { useNoticeSearch } from "../../hooks/useNoticeSearch";
import type { useCommodityCascade } from "../../hooks/useCommodityCascade";

/** useNoticeSearch 返回形态（form/query/result/actions 四段） */
export type SearchState = ReturnType<typeof useNoticeSearch>;

/** useCommodityCascade 返回形态（五级下拉 levels + URL 选中键） */
export type CommodityCascadeState = ReturnType<typeof useCommodityCascade>;
