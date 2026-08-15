/**
 * 管理运维 — 翻译重试路由
 * Admin translation retry routes
 *
 * @module server/routes/admin/translation.routes
 * @description 批量翻译重试运维端点（POST 触发 / GET 查询状态与诊断）。
 */
import { Router } from "express";
import type { AppContext } from "../../context";
import { asyncHandler } from "../../middleware/errorHandler";
import { runRetryTranslation, countPendingRetries, isRetryRunning, getLastRetryResult } from "../../services/translation/retry";
import type { RetryResult } from "../../services/translation/retry";
import { requireAdmin } from "./middleware";

export function createAdminTranslationRouter(ctx: AppContext): Router {
  const router = Router();

  // POST 触发批量重试（长时间运行，后台执行）
  router.post("/api/admin/retry-translation", requireAdmin, asyncHandler(async (req, res) => {
    if (isRetryRunning()) {
      res.status(409).json({ success: false, message: "批量重试已在运行中，请等待完成" });
      return;
    }
    const maxPerScan = Math.min(Math.max(parseInt(String(req.query.max_per_scan), 10) || 500, 1), 5000);
    const includeExpired = String(req.query.include_expired ?? "true").toLowerCase() !== "false";
    const concurrency = Math.min(Math.max(parseInt(String(req.query.concurrency), 10) || 10, 1), 30);
    const dailyCharBudget = Number(process.env.NOTICE_AUTO_TRANSLATE_DAILY_CHARS || 7_000_000);

    // 响应先返回（长时间运行），实际重试在后台执行
    res.json({
      success: true,
      message: "批量翻译重试已在后台启动，请通过 GET /api/admin/retry-translation 查看进度",
      options: { maxPerScan, includeExpired, concurrency, dailyCharBudget },
    });

    try {
      const retryResult: RetryResult = await runRetryTranslation(ctx.dbPool, { maxPerScan, includeExpired, concurrency, dailyCharBudget });
      console.log(
        `[admin-retry] 批量重试完成: 扫描=${retryResult.scanned} 成功=${retryResult.ok} 失败=${retryResult.failed} 跳过=${retryResult.skipped} 字符=${retryResult.charsUsed} 耗时=${Math.round(retryResult.durationMs / 1000)}s`
      );
    } catch (err: any) {
      console.error("[admin-retry] 后台执行失败:", err?.message || err);
    }
  }));

  // GET 查询重试状态与诊断
  router.get("/api/admin/retry-translation", requireAdmin, asyncHandler(async (_req, res) => {
    const running = isRetryRunning();
    const lastResult = getLastRetryResult();
    const diagnosis = await countPendingRetries(ctx.dbPool);
    res.json({
      success: true,
      running,
      last_result: lastResult,
      diagnosis,
    });
  }));

  return router;
}
