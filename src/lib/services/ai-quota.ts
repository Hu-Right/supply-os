/**
 * AI 计量权益消费（ai_summary_quota / ai_match_quota 的月度次数池）
 *
 * @module lib/services/ai-quota
 * @description 摘要/AI 匹配路由在"完整档"生成前扣一次月度额度（新矩阵：个人 30/月，
 *              企业/人工/内部 -1 不限，free 0——但 free 只到脱敏档，到不了本入口）。
 *              记账复用 unlock-quota 的开池/换代/扣减原语，额度唯一事实源 = 矩阵格 value_num。
 *
 *              额度唯一事实源 = 矩阵格 value_num，一切以新矩阵为准，无迁移过渡分支：
 *              - 矩阵缺行/缺格、value_num 为 NULL → 拒绝（数据缺陷必须浮出来，
 *                同 isEntitled「缺格不猜默认值」纪律，绝不静默当无限量放行）；
 *              - value_num = -1 → 明确不限（唯一不计量出口）；
 *              - value_num = 0 → 该档明确零额度，拒绝（矩阵显式账，不静默放行）；
 *              - 正数 → 月度池扣 1（日历月换代见 unlock-quota）。
 *
 *              事务形态与解锁不同：LLM 生成 20-60s，不能持行锁跨整个动作，
 *              故在独立短事务内完成"锁池→扣减→提交"，生成动作本身在事务外。
 *              计费口径 = 生成动作入口（缓存命中不扣；生成中途 LLM 失败不退，
 *              与解锁"动作入口扣减"同一纪律；并发由路由层限流封顶）。
 */
import type { Pool } from "mysql2/promise";
import { FREE_PLAN_CODE, type BenefitSystemRepo } from "../repos/benefit-system.repo";
import { ensureConsumableQuota, consumeQuota, UnlockQuotaError, type QuotaDeps } from "./unlock-quota";

export type AiQuotaDeps = QuotaDeps;

/** AI 计量拒绝：路由统一映射为 402 + EC_PAID_QUOTA_REQUIRED（与解锁额度耗尽同一错误形态） */
export class AiQuotaExceededError extends Error {
  constructor(public benefitCode: string) {
    super(`AI_QUOTA_EXHAUSTED:${benefitCode}`);
    this.name = "AiQuotaExceededError";
  }
}

/** 该用户档位在此计量码上的有限额度；null = 明确 -1 不限（唯一不计量出口） */
async function limitedQuotaTotal(
  catalog: BenefitSystemRepo,
  userId: number,
  benefitCode: string,
): Promise<number | null> {
  const plan = await catalog.findActivePlanForUser(userId);
  const planCode = plan?.plan_code ?? FREE_PLAN_CODE;
  const cells = await catalog.loadCells([planCode]);
  const cell = cells.find((c) => c.benefit_code === benefitCode);
  // 缺行/缺格/NULL：矩阵没声明计量 = 数据缺陷，拒绝而非静默无限量（新矩阵 330 格显式全填，正常路径到不了这里）
  if (!cell || cell.value_num === null || cell.value_num === undefined) {
    throw new AiQuotaExceededError(benefitCode);
  }
  const total = Number(cell.value_num);
  if (total === -1) return null; // 明确不限
  return total;
}

/**
 * 生成型 AI 动作入口扣一次月度额度；不计量时零副作用直接放行。
 * @throws AiQuotaExceededError 额度为 0 或月度池已耗尽/被冻结
 */
export async function consumeAiActionQuota(
  pool: Pool,
  deps: AiQuotaDeps,
  params: { userId: number; benefitCode: string },
): Promise<void> {
  const total = await limitedQuotaTotal(deps.catalog, params.userId, params.benefitCode);
  if (total === null) return; // 明确 -1 不限
  if (total <= 0) throw new AiQuotaExceededError(params.benefitCode); // 0 = 该档明确零额度

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    try {
      const locked = await ensureConsumableQuota(conn, deps, params);
      await consumeQuota(conn, deps, locked);
      await conn.commit();
    } catch (err) {
      // 回滚失败不得掩盖原始异常
      try {
        await conn.rollback();
      } catch {
        /* 忽略 */
      }
      if (err instanceof UnlockQuotaError) throw new AiQuotaExceededError(params.benefitCode);
      throw err;
    }
  } finally {
    conn.release();
  }
}
