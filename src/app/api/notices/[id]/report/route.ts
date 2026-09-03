/**
 * GET /api/notices/:id/report — 报告下载（docx 流式）
 *
 * @module app/api/notices/[id]/report/route
 * @description /report/preview 端点已拆分到 report/preview/route.ts。
 */
import { createHash } from "crypto";
import { promises as fs } from "fs";
import nodePath from "path";
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { findQualifiedOpportunityForNotice } from "@/lib/services/notices/featured";
import {
  buildBidReportDocx,
  mergeBidReportRow,
  bidReportFileName,
} from "@/lib/services/bid-report";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const reportCacheDir = () => nodePath.join(process.cwd(), "runtime", "bid_reports");

const ApiErrorCode = {
  USER_REQUIRED: 40001,
  NOTICE_NOT_FOUND: 40404,
  NOTICE_LOCKED: 40301,
  REPORT_NOT_AVAILABLE: 40405,
} as const;

function sendError(message: string, status: number, code: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ code, message, error: message, ...extra }, { status });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const noticeId = Number(id);
  const userId = auth.userId;

  if (!noticeId || !userId) {
    return sendError("请先登录并指定公告", 400, ApiErrorCode.USER_REQUIRED);
  }

  const ctx = getContext();
  const { detailRepo, unlockRepo } = ctx.notice;
  const opportunitiesRepo = ctx.opportunitiesRepo;

  const unlock = await unlockRepo.findUnlock(userId!, noticeId);
  if (!unlock) return sendError("公告已锁定，请先解锁", 403, ApiErrorCode.NOTICE_LOCKED, { core_locked: true });

  const notice = await detailRepo.findDetail(noticeId);
  if (!notice) return sendError("公告不存在", 404, ApiErrorCode.NOTICE_NOT_FOUND);

  const qualified = await findQualifiedOpportunityForNotice(ctx.dbPool, notice);
  if (!qualified) return sendError("报告不可用", 404, ApiErrorCode.REPORT_NOT_AVAILABLE);

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
}
