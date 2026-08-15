/**
 * 管理运维 — 数据操作路由
 * Admin data operations routes
 *
 * @module server/routes/admin/data-ops.routes
 * @description 桥接表全量同步、金额缓存回填、浏览量日汇总等数据管道运维端点。
 */
import { Router } from "express";
import type { AppContext } from "../../context";
import { asyncHandler } from "../../middleware/errorHandler";
import { syncUnspscBridgeFull } from "../../services/bridge-sync";
import { backfillUnspscCodeIds } from "../../db/backfills";
import { AMOUNT_PARSE_VERSION, backfillNoticeAmountCache, rollupNoticeViewDaily } from "../../services/amount/index";
import { requireAdmin } from "./middleware";

export function createAdminDataOpsRouter(ctx: AppContext): Router {
  const router = Router();
  const adminRepo = ctx.adminRepo;

  // 手动触发全量 bridge 回填（运维接口，幂等安全）
  router.post("/api/admin/sync-bridge", requireAdmin, async (_req, res) => {
    res.json({ success: true, message: "全量 bridge 回填已在后台启动，请查看服务日志获取进度" });
    // 响应先返回，回填在后台执行
    Promise.all([
      syncUnspscBridgeFull(ctx.dbPool, "notice"),
      syncUnspscBridgeFull(ctx.dbPool, "opportunity"),
    ]).then(() => backfillUnspscCodeIds(ctx.dbPool)).catch((err) => {
      console.warn("[BridgeSync] 手动触发全量回填失败:", err.message);
    });
  });

  // 金额缓存批量回填（手动触发，无定时器；每批 ≤2000 行短事务，可中断续跑）
  router.post("/api/admin/backfill-amounts", asyncHandler(async (req, res) => {
      const batches = Math.min(Math.max(parseInt(String(req.query.batches), 10) || 5, 1), 30);
      let processed = 0;
      for (let i = 0; i < batches; i++) {
        const result = await backfillNoticeAmountCache(ctx.dbPool);
        processed += result.processed;
        if (result.processed < 2000) break;
      }
      const remaining = await adminRepo.countAmountBackfillRemaining(AMOUNT_PARSE_VERSION);
      res.json({ success: true, processed, remaining });
  }));

  // 手动触发浏览量日汇总（懒计算之外的运维入口，无定时器）
  router.post("/api/admin/rollup-views", asyncHandler(async (req, res) => {
      const sinceDays = Math.min(Math.max(parseInt(String(req.query.since_days), 10) || 0, 0), 365);
      const result = await rollupNoticeViewDaily(ctx.dbPool, sinceDays);
      const stats = await adminRepo.getViewRollupStats();
      res.json({ success: true, affected: result.affected, rows_total: stats.rows_total, latest_day: stats.latest_day });
  }));

  return router;
}
