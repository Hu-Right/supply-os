/**
 * 数据质量前端防御工具
 * Data Quality Frontend Defense Utilities
 *
 * @module shared/utils/dataQuality
 * @description 系统性实现规划 §1.2 A 部分数据质量规则：
 *              - 截止日期异常拦截（> 当前年份+2 视为异常）
 *              - 金额缺失处理（空值/0 显示"未公开"）
 *              - 来源有效性校验
 *              - 状态标签时间窗口判定
 */

/** 截止日期合理性上限：当前年份 + 2 */
function maxDeadlineYear(): number {
  return new Date().getFullYear() + 2;
}

/**
 * 截止日期合理性校验
 * 超出当前年份+2 视为异常（规划 §1.2 A：截止日期异常如 2126 年）
 */
export function isDeadlineValid(deadlineSec: number | null | undefined): boolean {
  if (deadlineSec == null || deadlineSec <= 0) return false;
  const year = new Date(deadlineSec * 1000).getFullYear();
  return year <= maxDeadlineYear();
}

/**
 * 预算格式化 — 空值/0/无效 返回"未公开"
 * 规划 §1.2 A：金额缺失显示"未公开"而非 0
 */
export function formatBudget(value: string | null | undefined): string {
  if (!value || value === "0" || value === "0.00") return "未公开";
  const num = Number(value);
  if (Number.isNaN(num) || num <= 0) return "未公开";
  return `USD ${num.toLocaleString()}`;
}

/**
 * 来源有效性校验 — 必须有 source_url 或 source_name
 * 规划 §1.2 A：来源未知不进入精选/推荐
 */
export function hasValidSource(sourceUrl?: string | null, sourceName?: string | null): boolean {
  return Boolean((sourceUrl && sourceUrl.trim()) || (sourceName && sourceName.trim()));
}

/** 状态标签变体 */
export type BadgeVariant = "new" | "closing-soon" | "updated" | "has-attachment" | "member-unlock";

/**
 * 基于时间窗口推断状态标签
 * - new: create_time 在 48 小时内
 * - closing-soon: deadline 距今 <= 7 天
 * - updated: update_time 在 72 小时内且非新建
 * - has-attachment: 有可用附件
 * - member-unlock: 需会员解锁
 *
 * 返回最高优先级标签，或 null（无特殊状态）
 */
export function inferStatusBadge(params: {
  createSec?: number;
  updateSec?: number;
  deadlineSec?: number | null;
  hasAttachment?: boolean;
  isLocked?: boolean;
}): BadgeVariant | null {
  const nowSec = Date.now() / 1000;
  const FORTY_EIGHT_HOURS = 48 * 3600;
  const SEVENTY_TWO_HOURS = 72 * 3600;
  const SEVEN_DAYS = 7 * 24 * 3600;

  // NEW: 48 小时内新建
  if (params.createSec && (nowSec - params.createSec) <= FORTY_EIGHT_HOURS) {
    return "new";
  }

  // CLOSING SOON: 截止日期 <= 7 天
  if (params.deadlineSec && params.deadlineSec > 0) {
    const remaining = params.deadlineSec - nowSec;
    if (remaining > 0 && remaining <= SEVEN_DAYS) {
      return "closing-soon";
    }
  }

  // UPDATED: 72 小时内更新且非新建
  if (params.updateSec && (nowSec - params.updateSec) <= SEVENTY_TWO_HOURS) {
    return "updated";
  }

  // HAS ATTACHMENT
  if (params.hasAttachment) {
    return "has-attachment";
  }

  // MEMBER UNLOCK
  if (params.isLocked) {
    return "member-unlock";
  }

  return null;
}
