/**
 * CRM 模块常量 — 静态数据本地入口
 * CRM Constants — Local entry for static data
 *
 * @module features/crm/constants
 * @description 将 @/data 的 CRM 相关静态数据通过 feature 内部入口重导出，
 *              保持 feature 自包含，不直接依赖全局 @/data 路径。
 */
export { OPPORTUNITIES } from "@/data";
