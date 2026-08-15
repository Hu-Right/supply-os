/**
 * 管理运维 — 指标查询路由
 * Admin metrics routes
 *
 * @module server/routes/admin/metrics.routes
 * @description A/B 推荐指标等运维查询端点。
 */
import { Router } from "express";
import type { AppContext } from "../../context";
import { asyncHandler } from "../../middleware/errorHandler";
import { AB_TREATMENT_PCT } from "../../services/recommend/index";

export function createAdminMetricsRouter(ctx: AppContext): Router {
  const router = Router();
  const adminRepo = ctx.adminRepo;

  // A/B 指标端点：按 variant 聚合反馈流水四指标
  router.get("/api/admin/reco-ab-metrics", asyncHandler(async (req, res) => {
      const sinceDays = Math.min(Math.max(parseInt(String(req.query.since_days), 10) || 30, 1), 365);
      const rows = await adminRepo.listRecoAbMetrics(sinceDays);
      res.json({
        since_days: sinceDays,
        treatment_pct: AB_TREATMENT_PCT,
        variants: rows,
      });
  }));

  return router;
}
