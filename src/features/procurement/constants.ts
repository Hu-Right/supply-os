/**
 * 采购模块共享常量
 * Procurement module shared constants
 *
 * @description N7 收敛（2026-08-20）后再次上收（2026-08-28）：
 *              PAGE_SIZE 已迁移至 @/shared/constants/pagination（通用分页常量，
 *              消除 supplier→procurement 跨 feature 耦合），此处 re-export 保持
 *              模块内 5 处消费方的导入路径不变。
 */

export { PAGE_SIZE } from "@/shared/constants/pagination";
