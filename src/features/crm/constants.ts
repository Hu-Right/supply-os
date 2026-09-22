/**
 * CRM 模块常量 — 静态数据本地入口
 * CRM Constants — Local entry for static data
 *
 * @module features/crm/constants
 * @description 将 @/data 的 CRM 相关静态数据通过 feature 内部入口重导出，
 *              保持 feature 自包含，不直接依赖全局 @/data 路径。
 */
export { OPPORTUNITIES } from "@/data";

/** 判断商机是否已过期（deadline 为空视为永不过期） */
function _isOppExpired(deadline: string | null | undefined): boolean {
  if (!deadline) return false;
  const dl = new Date(deadline + (deadline.includes("T") ? "" : "T00:00:00Z"));
  if (isNaN(dl.getTime())) return false;
  return dl.getTime() < Date.now();
}

/** 有效商机列表（已过滤过期记录，供前端组件统一使用） */
import { OPPORTUNITIES as _RAW_OPP } from "@/data";
export const ACTIVE_OPPORTUNITIES = _RAW_OPP.filter((opp) => !_isOppExpired(opp.deadline));
