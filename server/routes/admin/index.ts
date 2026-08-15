/**
 * 管理运维路由编排入口
 * Admin routes orchestrator
 *
 * @module server/routes/admin/index
 * @description 按职责组合数据操作、质量监控、翻译重试、用户管理、指标查询等子路由。
 *              原 admin.routes.ts（330 行）拆分后的编排入口。
 */
import { Router } from "express";
import type { AppContext } from "../../context";
import { createAdminDataOpsRouter } from "./data-ops.routes";
import { createAdminQualityRouter } from "./quality.routes";
import { createAdminTranslationRouter } from "./translation.routes";
import { createAdminUserMgmtRouter } from "./user-mgmt.routes";
import { createAdminMetricsRouter } from "./metrics.routes";

export function createAdminRouter(ctx: AppContext): Router {
  const router = Router();
  // 挂载顺序 = 路由优先级
  router.use(createAdminDataOpsRouter(ctx));        // /api/admin/sync-bridge, backfill-amounts, rollup-views
  router.use(createAdminQualityRouter(ctx));        // /api/admin/quality-snapshot, /api/procurement/schema-status
  router.use(createAdminTranslationRouter(ctx));    // /api/admin/retry-translation
  router.use(createAdminUserMgmtRouter(ctx));       // /api/admin/users/:userKey/reset-*, email-logs
  router.use(createAdminMetricsRouter(ctx));        // /api/admin/reco-ab-metrics
  return router;
}
