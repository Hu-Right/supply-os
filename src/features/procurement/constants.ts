/**
 * 采购模块共享常量
 * Procurement module shared constants
 *
 * @description N7 收敛（2026-08-20）：PAGE_SIZE 原定义于 searchFormReducer.ts，
 *              但 5 处消费方存在 2 种导入路径（直连 reducer vs 经 useNoticeSearch re-export），
 *              且 SupplierPage 硬编码同值。现统一收敛至本常量文件。
 */

/** 列表分页大小（公告列表、推荐列表通用） */
export const PAGE_SIZE = 9;
