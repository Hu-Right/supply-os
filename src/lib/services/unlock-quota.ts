/**
 * 解锁配额消费共享逻辑（计量权益记账唯一口径）
 *
 * @module lib/services/unlock-quota
 * @description 公告解锁（notice-actions.executeUnlock）与商机解锁
 *              （opportunity-unlock.executeOpportunityUnlock）共享的 notice_view
 *              配额判定/消耗逻辑，以及 AI 摘要/匹配路由复用的通用计量入口。
 *              两条解锁路径共享同一份配额池——历史上商机路径
 *              "有订阅即无限放行、从不扣减"曾构成资损风险，收敛为一份逻辑防分叉。
 *
 *              记账原则（2026-09-23 切换到权益体系新账本，勿擅改）：
 *              - 配额发放/消耗唯一权威源 = benefit_quotas 的池行（按 benefit_code 一码一池）；
 *              - 池的额度来自 plan_benefits 矩阵格 value_num，不在代码里写数字；
 *              - 未订阅用户按 free 档那一列判定（free.notice_view 实库为 0，即已裁决的零额度）；
 *              - 不再"懒补建物化权益"：旧体系那套是为填补"有订阅无权益行"的历史缺口，
 *                新体系的池由履约时按矩阵批量开立，缺池只可能来自履约失败或矩阵缺格，
 *                此处按需开池仅限一次并用矩阵值封顶，不会像旧口径那样拿流水数反推用量。
 *              - opportunity_unlocks 流水仍写，但只作访问授权与审计明细，不作记账源。
 *              调用方须处于解锁事务内（FOR UPDATE 序列化同一用户并发）。
 *
 *              月度换代（2026-10-28 新矩阵）：ai_summary_quota / ai_match_quota 是
 *              "次/月"计量码，池代次按日历月切换——当前代次起点早于本月 1 号时开
 *              新一代次（period_starts_at=本月 1 号 00:00:00）。notice_view 不在
 *              换代名单里，仍是订阅期一份池，既有语义逐字不变。
 */
import type { PoolConnection } from "mysql2/promise";
import { FREE_PLAN_CODE, type BenefitSystemRepo } from "../repos/benefit-system.repo";
import type { BenefitWriteRepo, LockedPoolRow } from "../repos/benefit-write.repo";
import { AI_SUMMARY_QUOTA_BENEFIT, AI_MATCH_QUOTA_BENEFIT } from "./benefit-matrix";

/** 解锁消耗的权益码：标讯查看额度（计量型，矩阵 value_num 决定每档额度） */
export const NOTICE_VIEW_BENEFIT = "notice_view";

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

/** 配额业务失败：code 与 /api/notices|[id]/unlock 错误码语义对齐 */
export class UnlockQuotaError extends Error {
  constructor(public code: "PAID_QUOTA_REQUIRED") {
    super(code);
    this.name = "UnlockQuotaError";
  }
}

export interface QuotaDeps {
  catalog: BenefitSystemRepo;
  write: BenefitWriteRepo;
}

/**
 * 事务内锁定当前可消耗的计量池。benefitCode 缺省为 notice_view（解锁路径既有语义）。
 * @returns 已持行锁的池行（调用方用完须 consumeQuota 扣减）
 * @throws UnlockQuotaError 无池/池已耗尽/矩阵未声明额度
 */
export async function ensureConsumableQuota(
  conn: PoolConnection,
  deps: QuotaDeps,
  params: { userId: number; benefitCode?: string },
): Promise<LockedPoolRow> {
  const { catalog, write } = deps;
  const { userId, benefitCode = NOTICE_VIEW_BENEFIT } = params;

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
    throw new UnlockQuotaError("PAID_QUOTA_REQUIRED");
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
  } else if (!pool) {
    // 首次消耗时按矩阵值开池（幂等：撞唯一键只抬不降，不重置 quota_used）
    await write.openQuotaPool(conn, {
      subscriptionId,
      userId: poolUserId,
      benefitCode,
      quotaTotal,
    });
    pool = await write.findAndLockCurrentPool(conn, {
      userId: poolUserId,
      benefitCode,
      subscriptionId,
    });
  }
  if (!pool) throw new UnlockQuotaError("PAID_QUOTA_REQUIRED");
  return pool;
}

/**
 * 扣一份额度：行锁 + 条件 UPDATE + affectedRows 复核，防并发超卖。
 * @throws UnlockQuotaError 池已被并发耗尽/已冻结（退款或升级替代）
 */
export async function consumeQuota(
  conn: PoolConnection,
  deps: QuotaDeps,
  pool: LockedPoolRow,
): Promise<void> {
  const result = await deps.write.consumeLockedPool(conn, pool);
  if (result === "denied") {
    throw new UnlockQuotaError("PAID_QUOTA_REQUIRED");
  }
}
