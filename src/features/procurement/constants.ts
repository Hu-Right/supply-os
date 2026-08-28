/**
 * 采购模块共享常量
 * Procurement module shared constants
 *
 * @description N7 收敛（2026-08-20）后再次上收（2026-08-28）：
 *              PAGE_SIZE 已迁移至 @/shared/constants/pagination（通用分页常量，
 *              消除 supplier→procurement 跨 feature 耦合），此处 re-export 保持
 *              模块内消费方的导入路径不变。
 *              2026-08-28：列表视图重构后，公采公告独立使用 NOTICE_PAGE_SIZE = 10，
 *              其他模块（供应商列表等）继续使用共享 PAGE_SIZE = 9。
 */

export { PAGE_SIZE } from "@/shared/constants/pagination";

/** 公采公告列表每页条数（列表视图重构后从 9 调整为 10，匹配紧凑行布局的信息密度） */
export const NOTICE_PAGE_SIZE = 10;
