/**
 * 中文版订单拆解报告路由
 * Chinese bid breakdown report routes
 *
 * @description GET /api/notices/:id/report/preview — 解锁校验后返回报告结构化摘要 JSON；
 *              GET /api/notices/:id/report — 解锁校验后返回 docx 流式下载。
 *              两者解锁校验与 /:id/detail 完全同口径。
 *              错误响应保持 JSON（403 NOTICE_LOCKED / 404 REPORT_NOT_AVAILABLE），
 *              下载成功响应为 docx 附件（RFC 5987 中文文件名）。
 */
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { Router } from "express";
import type { AppContext } from "../../context";
import { normalizeUserKey } from "../../utils/normalize";
import { findQualifiedOpportunityForNotice } from "../../services/notices";
import { buildBidReportDocx, buildBidReportPreviewText, mergeBidReportRow, bidReportFileName } from "../../services/bidReport";
import { asyncHandler } from "../../middleware/errorHandler";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** 报告缓存目录（对齐 CRM PHP 版 runtime/bid_reports 约定；不在 public/ 下，防绕过解锁校验） */
const reportCacheDir = () => path.join(process.cwd(), "runtime", "bid_reports");

export function createNoticeReportRouter(ctx: AppContext): Router {
  const router = Router();
  const noticesRepo = ctx.noticesRepo;
  const opportunitiesRepo = ctx.opportunitiesRepo;

  // ── 报告预览（结构化 JSON 摘要，前端 ReportPreviewPanel 消费）──
  // 任何登录用户均可访问（未解锁用户看到约 10% 预览 + 会员升级引导）；
  // 无合格机会的公告返回 404（无报告可预览）。
  router.get("/api/notices/:id/report/preview", asyncHandler(async (req, res) => {
    const noticeId = Number(req.params.id);
    const userKey = normalizeUserKey(req.query.user_key) || "";
    if (!noticeId || !userKey) return res.status(400).json({ error: "USER_AND_NOTICE_REQUIRED" });

    const [unlock, notice] = await Promise.all([
      noticesRepo.findUnlock(userKey, noticeId),
      noticesRepo.findDetail(noticeId),
    ]);
    if (!notice) return res.status(404).json({ error: "NOTICE_NOT_FOUND" });

    const qualified = await findQualifiedOpportunityForNotice(ctx.dbPool, notice);
    if (!qualified) return res.status(404).json({ error: "REPORT_NOT_AVAILABLE" });

    const fullOpportunity = await opportunitiesRepo.findFullById(Number(qualified.id));
    const opportunity = fullOpportunity || qualified;
    const row = mergeBidReportRow(notice, opportunity);

    // 使用与 Word 文档同构的纯文本预览生成函数，确保预览内容 = Word 文件内容
    const sections = buildBidReportPreviewText(row);

    res.json({
      sections,
      is_unlocked: !!unlock,
      has_full_report: true,
    });
  }));

  // ── 报告下载（docx 流式附件）──
  router.get("/api/notices/:id/report", asyncHandler(async (req, res) => {
      const noticeId = Number(req.params.id);
      const userKey = normalizeUserKey(req.query.user_key) || "";
      if (!noticeId || !userKey) return res.status(400).json({ error: "USER_AND_NOTICE_REQUIRED" });
  
      const unlock = await noticesRepo.findUnlock(userKey, noticeId);
      if (!unlock) return res.status(403).json({ error: "NOTICE_LOCKED", core_locked: true });

      const notice = await noticesRepo.findDetail(noticeId);
      if (!notice) return res.status(404).json({ error: "NOTICE_NOT_FOUND" });
  
      const qualified = await findQualifiedOpportunityForNotice(ctx.dbPool, notice);
      if (!qualified) return res.status(404).json({ error: "REPORT_NOT_AVAILABLE" });
  
      const fullOpportunity = await opportunitiesRepo.findFullById(Number(qualified.id));
      const opportunity = fullOpportunity || qualified;
  
      const row = mergeBidReportRow(notice, opportunity);
      const fileName = bidReportFileName(row);
  
      const fingerprint = createHash("md5")
        .update(`${opportunity.id}|${String(opportunity.update_time || "")}`)
        .digest("hex")
        .slice(0, 12);
      const cacheDir = reportCacheDir();
      const cachePath = path.join(cacheDir, `bid_report_${noticeId}_${opportunity.id}_${fingerprint}.docx`);
  
      let buffer: Buffer | null = null;
      try {
        buffer = await fs.readFile(cachePath);
      } catch {
        /* 缓存未命中：生成 */
      }
      if (!buffer) {
        buffer = await buildBidReportDocx(row);
        try {
          await fs.mkdir(cacheDir, { recursive: true });
          const stale = (await fs.readdir(cacheDir)).filter(
            (f) => f.startsWith(`bid_report_${noticeId}_`) && f !== path.basename(cachePath)
          );
          await Promise.all(stale.map((f) => fs.unlink(path.join(cacheDir, f)).catch(() => undefined)));
          await fs.writeFile(cachePath, buffer);
        } catch {
          /* 缓存写失败不影响下载 */
        }
      }
  
      const asciiName = `bid_report_${noticeId}.docx`;
      res.setHeader("Content-Type", DOCX_MIME);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
      );
      res.setHeader("Content-Length", String(buffer.length));
      return res.end(buffer);
  }));

  return router;
}
