/**
 * GET /api/notices/:id/report — 报告下载（docx 流式）
 *
 * @module app/api/notices/[id]/report/route
 * @description /report/preview 端点已拆分到 report/preview/route.ts。
 */
import { createHash } from "crypto";
import { promises as fs } from "fs";
import nodePath from "path";
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { findQualifiedOpportunityForNotice } from "@/lib/services/notices/featured";
import {
  buildBidReportDocx,
  mergeBidReportRow,
  bidReportFileName,
} from "@/lib/services/bid-report";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const reportCacheDir = () => nodePath.join(process.cwd(), "runtime", "bid_reports");

import {
  EC_NOTICE_NOT_FOUND_404, EC_ACCESS_FORBIDDEN, EC_REPORT_NOT_AVAILABLE,
} from "@/shared/constants/api";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    const { id } = await params;
    const noticeId = Number(id);
    const userId = auth.userId;

    if (!noticeId) {
      routeError(400, EC_NOTICE_NOT_FOUND_404, "请先登录并指定公告");
    }

    const ctx = getContext();
    const { detailRepo, unlockRepo } = ctx.notice;
    const opportunitiesRepo = ctx.opportunitiesRepo;

    const unlock = await unlockRepo.findUnlock(userId, noticeId);
    if (!unlock) routeError(403, EC_ACCESS_FORBIDDEN, "公告已锁定，请先解锁", { core_locked: true });

    const notice = await detailRepo.findDetail(noticeId);
    if (!notice) routeError(404, EC_NOTICE_NOT_FOUND_404, "公告不存在");

    const qualified = await findQualifiedOpportunityForNotice(ctx.dbPool, notice);
    if (!qualified) routeError(404, EC_REPORT_NOT_AVAILABLE, "报告不可用");

    const fullOpportunity = await opportunitiesRepo.findFullById(Number(qualified.id));
    const opportunity = fullOpportunity || qualified;

    const row = mergeBidReportRow(notice, opportunity);
    const fileName = bidReportFileName(row);

    const fingerprint = createHash("md5")
      .update(`${opportunity.id}|${String(opportunity.update_time || "")}`)
      .digest("hex")
      .slice(0, 12);
    const cacheDir = reportCacheDir();
    const cachePath = nodePath.join(cacheDir, `bid_report_${noticeId}_${opportunity.id}_${fingerprint}.docx`);

    let buffer: Buffer | null = null;
    try {
      buffer = await fs.readFile(cachePath);
    } catch {
      // 缓存未命中：生成
    }
    if (!buffer) {
      buffer = await buildBidReportDocx(row);
      try {
        await fs.mkdir(cacheDir, { recursive: true });
        const stale = (await fs.readdir(cacheDir)).filter(
          (f) => f.startsWith(`bid_report_${noticeId}_`) && f !== nodePath.basename(cachePath),
        );
        await Promise.all(stale.map((f) => fs.unlink(nodePath.join(cacheDir, f)).catch(() => undefined)));
        await fs.writeFile(cachePath, buffer);
      } catch {
        // 缓存写失败不影响下载
      }
    }

    const asciiName = `bid_report_${noticeId}.docx`;
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": DOCX_MIME,
        "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Content-Length": String(buffer.length),
      },
    });
  },
);
