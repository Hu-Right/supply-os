/**
 * 会员展示层纯函数（客户端安全，无 server 依赖）
 * Membership view helpers — client-safe, presentation-only derivations.
 *
 * @module shared/utils/membership-view
 * @description 新权益体系下，"剩余解锁次数"一律来自额度账本 notice_view 池，
 *              与后端门控/升级预览同源；此处集中供六卡状态卡、账号卡、公告侧栏复用，
 *              避免各组件各自拼装额度字段。
 */
import type { QuotaBalanceRow } from "@/types";

/** 解锁额度权益码：与 membership-upgrade 服务、门控常量同源。 */
export const UNLOCK_BENEFIT_CODE = "notice_view";

/** "不限"额度的内部哨兵值：与后端 crm_benefit_quotas.quota_total = -1 同源（不再用 9999 魔法数）。 */
export const UNLIMITED_QUOTA = -1;

/** 是否"不限"额度：unlockRemaining 命中后端 quota_total=-1 时返回 UNLIMITED_QUOTA。 */
export function isUnlimitedQuota(remaining: number): boolean {
  return remaining === UNLIMITED_QUOTA;
}

/** 是否仍有可用解锁额度：不限（UNLIMITED_QUOTA）或余额 > 0。用于门控"能不能解锁"。 */
export function hasUnlockQuota(remaining: number): boolean {
  return remaining === UNLIMITED_QUOTA || remaining > 0;
}

/**
 * 从额度池取「剩余解锁次数」。
 * - 缺池（普通用户未开池等）→ 0；
 * - remaining === null（后端 quota_total=-1 不限）→ UNLIMITED_QUOTA(-1)；
 * - 其余取非负余额。
 * 消费方判"不限"用 isUnlimitedQuota、判"可用"用 hasUnlockQuota，勿再裸比较 9999/>0。
 */
export function unlockRemaining(quotas: QuotaBalanceRow[] | null | undefined): number {
  const pool = quotas?.find((q) => q.benefit_code === UNLOCK_BENEFIT_CODE);
  if (!pool) return 0;
  if (pool.remaining === null) return UNLIMITED_QUOTA;
  return Math.max(0, pool.remaining);
}
