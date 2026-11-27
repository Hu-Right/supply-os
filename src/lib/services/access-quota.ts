/**
 * 计量配额消费共享逻辑（计量权益记账唯一口径）
 *
 * @module lib/services/access-quota
 * @description AI 摘要/匹配路由复用的通用计量入口（经 ai-quota.ts 调用）。
 *              2026-11-27 单条解锁/次数体系下线：notice_view 不再有消耗方，
 *              NOTICE_VIEW 常量与按订阅期懒开池分支已删除——池仍由履约按
 *              矩阵格统一开立（benefit-write.grantQuotaPoolsForPlan），升级抵扣
 *              窗口校验仍读 notice_view 池，账本语义不变。
 *
 *              记账原则（2026-09-23 切换到权益体系新账本，勿擅改）：
 *              - 配额发放/消耗唯一权威源 = benefit_quotas 的池行（按 benefit_code 一码一池）；
 *              - 池的额度来自 plan_benefits 矩阵格 value_num，不在代码里写数字；
 *              - 不代偿缺池：新体系的池由履约时按矩阵批量开立，缺池只可能来自
 *                履约失败或矩阵缺格，月度计量码按换代规则开新代次。
 *              调用方须处于事务内（FOR UPDATE 序列化同一用户并发）。
 *
 *              月度换代（2026-10-28 新矩阵）：ai_summary_quota / ai_match_quota 是
 *              "次/月"计量码，池代次按日历月切换——当前代次起点早于本月 1 号时开
 *              新一代次（period_starts_at=本月 1 号 00:00:00）。
 */
import type { PoolConnection } from "mysql2/promise";
import { FREE_PLAN_CODE, type BenefitSystemRepo } from "../repos/benefit-system.repo";
import type { BenefitWriteRepo, LockedPoolRow } from "../repos/benefit-write.repo";
import { AI_SUMMARY_QUOTA_BENEFIT, AI_MATCH_QUOTA_BENEFIT } from "./benefit-matrix";

/** 按日历月换代的计量码：月内重复开池幂等抬额，跨月显式开新一代次（月度额度重置的唯一实现点） */
const MONTHLY_QUOTA_BENEFITS: ReadonlySet<string> = new Set([
  AI_SUMMARY_QUOTA_BENEFIT,
  AI_MATCH_QUOTA_BENEFIT,
]);

/** 本月 1 号 00:00:00（服务器本地时区，与 mysql2 驱动的 Date 序列化时区一致） */
function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** 配额业务失败：code 保留既有错误码语义（41002 PAID_QUOTA_REQUIRED） */
export class AccessQuotaError extends Error {
  constructor(public code: "PAID_QUOTA_REQUIRED") {
    super(code);
    this.name = "AccessQuotaError";
  }
}

export interface QuotaDeps {
  catalog: BenefitSystemRepo;
  write: BenefitWriteRepo;
}

/**
 * 事务内锁定当前可消耗的计量池。
 * @returns 已持行锁的池行（调用方用完须 consumeQuota 扣减）
 * @throws AccessQuotaError 无池/池已耗尽/矩阵未声明额度
 */
export async function ensureConsumableQuota(
  conn: PoolConnection,
  deps: QuotaDeps,
  params: { userId: number; benefitCode: string },
): Promise<LockedPoolRow> {
  const { catalog, write } = deps;
  const { userId, benefitCode } = params;

  const active = await catalog.findActivePlanForUser(userId);
  // 池记在订阅主账号名下（本人订阅；无订阅 = 普通用户池记本人）
  const poolUserId = active?.owner_user_id ?? userId;
  const subscriptionId = active?.subscription_id ?? null;
  const planCode = active?.plan_code ?? FREE_PLAN_CODE;

  const cells = await catalog.loadCells([planCode]);
  const cell = cells.find((c) => c.benefit_code === benefitCode);
  // 缺格与 value_num 为空一律拒绝，不猜默认额度：矩阵没写就是没有，
  // 猜一个数等于凭代码创造商品内容（价格文档才是唯一事实源）。
  const quotaTotal = cell?.value_num === null || cell?.value_num === undefined ? NaN : Number(cell.value_num);
  if (!Number.isFinite(quotaTotal) || quotaTotal === 0) {
    throw new AccessQuotaError("PAID_QUOTA_REQUIRED");
  }

  let pool = await write.findAndLockCurrentPool(conn, {
    userId: poolUserId,
    benefitCode,
    subscriptionId,
  });
  if (MONTHLY_QUOTA_BENEFITS.has(benefitCode)) {
    // 月度换代：当前代次起点早于本月（或尚无任何代次）→ 以本月 1 号为起点开新一代次。
    // 同月内重入时 period_starts_at 相同 ⇒ 撞 uk_pool 只抬额，天然幂等。
    const monthStart = startOfCurrentMonth();
    if (!pool || pool.period_starts_at < monthStart) {
      await write.openQuotaPool(conn, {
        subscriptionId,
        userId: poolUserId,
        benefitCode,
        quotaTotal,
        periodStartsAt: monthStart,
      });
      pool = await write.findAndLockCurrentPool(conn, {
        userId: poolUserId,
        benefitCode,
        subscriptionId,
      });
    }
  }
  if (!pool) throw new AccessQuotaError("PAID_QUOTA_REQUIRED");
  return pool;
}

/**
 * 扣一份额度：行锁 + 条件 UPDATE + affectedRows 复核，防并发超卖。
 * @throws AccessQuotaError 池已被并发耗尽/已冻结（退款或升级替代）
 */
export async function consumeQuota(
  conn: PoolConnection,
  deps: QuotaDeps,
  pool: LockedPoolRow,
): Promise<void> {
  const result = await deps.write.consumeLockedPool(conn, pool);
  if (result === "denied") {
    throw new AccessQuotaError("PAID_QUOTA_REQUIRED");
  }
}
