/**
 * 中文版订单拆解报告下载路由
 * Chinese bid breakdown report download route
 *
 * @description GET /api/notices/:id/report — 解锁校验与 /:id/detail 完全同口径；
 *              合格 opportunity 命中后按 update_time 指纹做磁盘缓存
 *              （runtime/bid_reports/），未命中实时生成 docx 流式下载。
 *              错误响应保持 JSON（403 NOTICE_LOCKED / 404 REPORT_NOT_AVAILABLE），
 *              成功响应为 docx 附件（RFC 5987 中文文件名）。
 */
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { Router } from "express";
import type { AppContext } from "../../context";
import { normalizeUserKey } from "../../utils/normalize";
import { findQualifiedOpportunityForNotice } from "../../services/notices";
import { buildBidReportDocx, mergeBidReportRow, bidReportFileName } from "../../services/bidReport";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** 报告缓存目录（对齐 CRM PHP 版 runtime/bid_reports 约定；不在 public/ 下，防绕过解锁校验） */
const reportCacheDir = () => path.join(process.cwd(), "runtime", "bid_reports");

export function createNoticeReportRouter(ctx: AppContext): Router {
  const router = Router();
  const { dbPool } = ctx;

  router.get("/api/notices/:id/report", async (req, res) => {
    try {
      const noticeId = Number(req.params.id);
      const userKey = normalizeUserKey(req.query.user_key) || "";
      if (!noticeId || !userKey) return res.status(400).json({ error: "USER_AND_NOTICE_REQUIRED" });

      // 解锁校验：与 /:id/detail 完全同口径
      const [unlockRows] = await dbPool.query(
        "SELECT id FROM crm_opportunity_unlocks WHERE user_key = ? AND notice_id = ? LIMIT 1",
        [userKey, noticeId]
      );
      if (!(unlockRows as any[])[0]) return res.status(403).json({ error: "NOTICE_LOCKED", core_locked: true });

      const [noticeRows] = await dbPool.query(
        `SELECT id, notice_id, reference, title, notice_type, agency, organization, country,
           deadline, deadline_ts, estimated_value, description, industry, url, contacts,
           documents, procurement_files, external_links, agency_full, published_date,
           difficulty, registration_level, key_contacts, unspsc_codes, converted_opp_id, is_converted
         FROM crm_bid_notices WHERE id = ? LIMIT 1`,
        [noticeId]
      );
      const notice = (noticeRows as any[])[0];
      if (!notice) return res.status(404).json({ error: "NOTICE_NOT_FOUND" });

      // 三路匹配合格 opportunity（无则该公告没有中文拆解报告）
      const qualified = await findQualifiedOpportunityForNotice(dbPool, notice);
      if (!qualified) return res.status(404).json({ error: "REPORT_NOT_AVAILABLE" });

      // 报告需要 findQualifiedOpportunityForNotice SELECT 之外的列
      // （incoterms/source_platform/training_link/remark/description_other/update_time 等），
      // 按 id 全列回查一次，兼容 CRM 侧后续加列
      const [fullRows] = await dbPool.query("SELECT * FROM crm_bid_opportunities WHERE id = ? LIMIT 1", [
        Number(qualified.id),
      ]);
      const opportunity = (fullRows as any[])[0] || qualified;

      const row = mergeBidReportRow(notice, opportunity);
      const fileName = bidReportFileName(row);

      // 磁盘缓存：指纹 = opportunity id + update_time，CRM 更新拆解内容后自动失效
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
          // 清理同 notice 的旧指纹缓存，防堆积
          const stale = (await fs.readdir(cacheDir)).filter(
            (f) => f.startsWith(`bid_report_${noticeId}_`) && f !== path.basename(cachePath)
          );
          await Promise.all(stale.map((f) => fs.unlink(path.join(cacheDir, f)).catch(() => undefined)));
          await fs.writeFile(cachePath, buffer);
        } catch {
          /* 缓存写失败不影响下载 */
        }
      }

      // RFC 5987 中文文件名 + ASCII 兜底
      const asciiName = `bid_report_${noticeId}.docx`;
      res.setHeader("Content-Type", DOCX_MIME);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
      );
      res.setHeader("Content-Length", String(buffer.length));
      return res.end(buffer);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
}
