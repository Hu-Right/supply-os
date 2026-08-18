/**
 * 启动阶段定义
 * Bootstrap Phases Definition
 *
 * @module server/lifecycle/phases
 * @description 将启动流程拆分为独立阶段，每个阶段可独立错误处理、日志、耗时统计。
 */
import type { Pool } from "mysql2/promise";
import { ensureProcurementSchema } from "../db/schema";
import { runSeeds } from "../db/seeds";
import { backfillUserIds, backfillIndustryPrefsL45Null, hydratePaymentEnvFromDb } from "../db/backfills";
import { seedAgencyAliases } from "../services/agencyAliasSeed";
import { refreshFeaturedColumn } from "../services/notices/index";
import { isHealthy as isMeiliHealthy, syncNoticeIds } from "../services/meilisearch/index";

export interface PhaseContext {
  dbPool: Pool;
}

export interface Phase {
  name: string;
  run: (ctx: PhaseContext) => Promise<void>;
  optional?: boolean; // 失败不阻断启动
}

/**
 * 阶段 1: Schema 迁移
 */
export const schemaPhase: Phase = {
  name: "schema",
  async run(ctx) {
    await ensureProcurementSchema(ctx.dbPool);
  },
};

/**
 * 阶段 2: 种子数据
 */
export const seedsPhase: Phase = {
  name: "seeds",
  async run(ctx) {
    await runSeeds(ctx.dbPool, {
      enabled: String(process.env.SEED_ENABLED ?? "on").toLowerCase() !== "off",
    });
  },
};

/**
 * 阶段 3: 机构别名种子
 */
export const agencyAliasPhase: Phase = {
  name: "agency-alias",
  optional: true,
  async run(ctx) {
    await seedAgencyAliases(ctx.dbPool);
  },
};

/**
 * 阶段 4: 用户 ID 回填
 */
export const backfillPhase: Phase = {
  name: "backfill",
  async run(ctx) {
    await backfillUserIds(ctx.dbPool);
    // 清洗行业偏好中被静默持久化的推断层级 L4/L5（幂等；启动期缓存尚空，无需失效）
    const prefsNulled = await backfillIndustryPrefsL45Null(ctx.dbPool);
    if (prefsNulled > 0) {
      console.log(`[backfill] 行业偏好存量 L4/L5 推断数据已清洗：${prefsNulled} 条`);
    }
  },
};

/**
 * 阶段 5: 精选列回填
 */
export const featuredPhase: Phase = {
  name: "featured",
  optional: true,
  async run(ctx) {
    const result = await refreshFeaturedColumn(ctx.dbPool);
    if (result.changedIds.length > 0 && isMeiliHealthy()) {
      await syncNoticeIds(ctx.dbPool, result.changedIds);
    }
  },
};

/**
 * 阶段 6: 支付环境回填
 */
export const paymentPhase: Phase = {
  name: "payment",
  async run(ctx) {
    await hydratePaymentEnvFromDb(ctx.dbPool);
  },
};

/**
 * 执行单个阶段
 */
export async function executePhase(phase: Phase, ctx: PhaseContext): Promise<boolean> {
  const start = Date.now();
  try {
    await phase.run(ctx);
    const duration = Date.now() - start;
    console.log(`[bootstrap] ✓ ${phase.name} 完成 (${duration}ms)`);
    return true;
  } catch (err) {
    const duration = Date.now() - start;
    if (phase.optional) {
      console.warn(`[bootstrap] ⚠ ${phase.name} 失败（静默降级，${duration}ms）:`, (err as Error).message);
      return true;
    } else {
      console.error(`[bootstrap] ✗ ${phase.name} 失败（${duration}ms）:`, (err as Error).message);
      return false;
    }
  }
}
