/**
 * RFQ 编号器
 * @module lib/services/rfq/reference
 *
 * @description 生成可读编号 `OSRFQ-{年}-{6位序号}`，与爬虫的 `RFQ-` 命名空间结构隔离。
 *              序号取 rfq_demand 自增主键（全局单调、天然唯一，唯一索引兜底），
 *              年份按 Asia/Shanghai 计（业务时区），避免跨年零点出现两份年份口径。
 *
 *              为什么不单独建序列表：并发下需要额外行锁与重试；自增主键已满足单调+唯一，
 *              且编号里带年份前缀已满足"可读、可追溯、可排序"。
 */
import { DEMAND_REFERENCE_PREFIX } from "@/shared/constants/rfq-demand";

const SHANGHAI_OFFSET_SEC = 8 * 3600;

/** 取业务时区（Asia/Shanghai）年份 */
export function demandYear(atSec: number): number {
  return new Date((atSec + SHANGHAI_OFFSET_SEC) * 1000).getUTCFullYear();
}

/** 由自增 id 与创建时间生成可读编号 */
export function formatDemandReference(id: number, createdAtSec: number): string {
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`formatDemandReference: invalid id ${id}`);
  }
  const year = demandYear(createdAtSec);
  return `${DEMAND_REFERENCE_PREFIX}-${year}-${String(Math.trunc(id)).padStart(6, "0")}`;
}

/** 校验编号形态（用于入库前自检与回调参数校验） */
export function isDemandReference(value: string): boolean {
  return new RegExp(`^${DEMAND_REFERENCE_PREFIX}-\\d{4}-\\d{6,}$`).test(value);
}
