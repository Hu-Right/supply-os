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
import { buildBidReportDocx, buildBidReportPreviewText, estimateFullReportCharCount, mergeBidReportRow, bidReportFileName } from "../../services/bid-report/index";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireAuth } from "../../middleware/auth";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** 报告缓存目录（对齐 CRM PHP 版 runtime/bid_reports 约定；不在 public/ 下，防绕过解锁校验） */
const reportCacheDir = () => path.join(process.cwd(), "runtime", "bid_reports");

export function createNoticeReportRouter(ctx: AppContext): Router {
  const router = Router();
  const noticesRepo = ctx.notice.noticesRepo;
  const opportunitiesRepo = ctx.opportunitiesRepo;

  // ── 报告预览（结构化 JSON 摘要，前端 ReportPreviewPanel 消费）──
  // 任何登录用户均可访问（未解锁用户看到约 10% 预览 + 会员升级引导）；
  // 预览内容按语言环境自适应：zh 优先 description_cn，非 zh 直接 description；
  // 无合格机会的公告返回 404（无报告可预览）。
  // P0-12 安全修复：报告预览必须 JWT 认证，身份取自 req.userKey
  router.get("/api/notices/:id/report/preview", requireAuth, asyncHandler(async (req, res) => {
    const noticeId = Number(req.params.id);
    const userKey = req.userKey || "";
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

    const lang = typeof req.query.lang === "string" ? req.query.lang : "zh";
    const sections = buildBidReportPreviewText(row, lang);
    const total_report_chars = estimateFullReportCharCount(row);

    // P0-12 安全修复：未解锁用户服务端截断 sections 内容（而非仅前端截断）
    const MAX_CHARS_PER_SECTION = 500;
    const safeSections = unlock
      ? sections
      : sections.map((s: { heading: string; body: string }) => ({
          ...s,
          body: s.body.length > MAX_CHARS_PER_SECTION ? s.body.slice(0, MAX_CHARS_PER_SECTION) + "…" : s.body,
        }));

    res.json({
      sections: safeSections,
      is_unlocked: !!unlock,
      has_full_report: true,
      total_report_chars,
    });
  }));

  // P0-12 安全修复：报告下载必须 JWT 认证
  router.get("/api/notices/:id/report", requireAuth, asyncHandler(async (req, res) => {
      const noticeId = Number(req.params.id);
      const userKey = req.userKey || "";
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
