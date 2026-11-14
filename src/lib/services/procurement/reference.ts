/**
 * 采购需求编号器
 * @module lib/services/procurement/reference
 *
 * @description 生成可读编号 `OSPR-{年}-{6位序号}`（OSPR = OS Procurement Requirement），
 *              与爬虫的 `RFQ-` 命名空间结构隔离。序号取 procurement_projects 自增主键
 *              （全局单调、天然唯一，唯一索引兜底），年份按 Asia/Shanghai 计（业务时区）。
 *              发布编号 `OSPT-{年}-{6位id}` 同构（tender 自增主键）。语义同旧 rfq/reference.ts。
 */
import { PROJECT_REF_PREFIX, TENDER_NO_PREFIX } from "@/shared/constants/procurement";

const SHANGHAI_OFFSET_SEC = 8 * 3600;

/** 取业务时区（Asia/Shanghai）年份 */
export function procurementYear(atSec: number): number {
  return new Date((atSec + SHANGHAI_OFFSET_SEC) * 1000).getUTCFullYear();
}

/** 由项目自增 id 与创建时间生成需求编号 */
export function formatProjectReference(id: number, createdAtSec: number): string {
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`formatProjectReference: invalid id ${id}`);
  }
  return `${PROJECT_REF_PREFIX}-${procurementYear(createdAtSec)}-${String(Math.trunc(id)).padStart(6, "0")}`;
}

/** 由 tender 自增 id 与发布时间生成正式发布编号 */
export function formatTenderNo(id: number, publishedAtSec: number): string {
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`formatTenderNo: invalid id ${id}`);
  }
  return `${TENDER_NO_PREFIX}-${procurementYear(publishedAtSec)}-${String(Math.trunc(id)).padStart(6, "0")}`;
}

/** 校验需求编号形态（入库前自检与回调参数校验） */
export function isProjectReference(value: string): boolean {
  return new RegExp(`^${PROJECT_REF_PREFIX}-\\d{4}-\\d{6,}$`).test(value);
}
