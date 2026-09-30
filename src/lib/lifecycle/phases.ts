/**
 * 启动阶段定义
 * Bootstrap Phases Definition
 *
 * @module server/lifecycle/phases
 * @description 将启动流程拆分为独立阶段，每个阶段可独立错误处理、日志、耗时统计。
 *              启动期不再做任何 DDL：结构以生产库当前状态为事实源（全库终态见
 *              docs/数据库设计/_baseline-20260929/schema-all-tables.sql）。
 *
 *              【未完成的维护窗口事项，勿丢】宽表源指纹列（原迁移 087）仍未加：
 *              生产宽表 46.2 万行无法 ALGORITHM=INSTANT，必须安排维护窗口；运行期已做成
 *              「列缺失则自动降级」（见 search-sync/wide-fingerprint.ts），所以没列也能正常跑。
 *              代码本体在 docs/数据库设计/_baseline-20260929/pre-delete-backup/migrations-full.zip
 *              （文件名 087-wide-table-sync-fingerprint.ts）；但仓库已无迁移执行器，加列请直接对库执行 DDL。
 */
import type { Pool } from "mysql2/promise";
import { backfillIndustryPrefsL45Null, hydratePaymentEnvFromDb } from "../db/backfills";
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
 * 阶段 1: 存量数据回填
 * （原「Schema 迁移」阶段已随迁移链清空而删除：结构以生产库当前状态为事实源，启动期不再做 DDL。）
 */
export const backfillPhase: Phase = {
  name: "backfill",
  async run(ctx) {
    // 清洗行业偏好中被静默持久化的推断层级 L4/L5（幂等；启动期缓存尚空，无需失效）
    const prefsNulled = await backfillIndustryPrefsL45Null(ctx.dbPool);
    if (prefsNulled > 0) {
      console.log(`[backfill] 行业偏好存量 L4/L5 推断数据已清洗：${prefsNulled} 条`);
    }
  },
};

/**
 * 阶段 2: 精选列回填
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
 * 阶段 3: 支付环境回填
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
