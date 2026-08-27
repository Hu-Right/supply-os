/**
 * 中文版订单拆解报告路由（预览 + 下载）
 * Chinese bid breakdown report routes (preview + download)
 *
 * @module app/api/notices/[id]/report/route
 * @description 从 Express routes/notices/report.routes.ts 迁移。
 *              GET /api/notices/:id/report/preview — 解锁校验后返回报告结构化摘要 JSON；
 *              GET /api/notices/:id/report — 解锁校验后返回 docx 流式下载。
 */
import { createHash } from "crypto";
import { promises as fs } from "fs";
import nodePath from "path";
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { findQualifiedOpportunityForNotice } from "@/server/services/notices/featured";
import {
  buildBidReportDocx,
  buildBidReportPreviewText,
  estimateFullReportCharCount,
  mergeBidReportRow,
  bidReportFileName,
} from "@/server/services/bid-report";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// 报告缓存目录（对齐 CRM PHP 版 runtime/bid_reports 约定）
const reportCacheDir = () => nodePath.join(process.cwd(), "runtime", "bid_reports");

// ── 错误码定义 ──
const ApiErrorCode = {
  USER_REQUIRED: 40001,
  NOTICE_NOT_FOUND: 40404,
  NOTICE_LOCKED: 40301,
  REPORT_NOT_AVAILABLE: 40405,
} as const;

function sendError(message: string, status: number, code: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ code, message, error: message, ...extra }, { status });
}

// ── GET 端点 ──
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const path = url.pathname;

  // GET /api/notices/:id/report/preview — 报告预览（结构化 JSON 摘要）
  if (/^\/api\/notices\/\d+\/report\/preview$/.test(path)) {
    const auth = await requireUserKey(req);
    if (auth instanceof Response) return auth;

    const idMatch = path.match(/\/api\/notices\/(\d+)\/report\/preview$/);
    const noticeId = idMatch ? Number(idMatch[1]) : 0;
    const userKey = auth.userKey;

    if (!noticeId || !userKey) {
      return sendError("请先登录并指定公告", 400, ApiErrorCode.USER_REQUIRED);
    }

    const ctx = getContext();
    const { detailRepo, unlockRepo } = ctx.notice;
    const opportunitiesRepo = ctx.opportunitiesRepo;

    const [unlock, notice] = await Promise.all([
      unlockRepo.findUnlock(userKey, noticeId),
      detailRepo.findDetail(noticeId),
    ]);
    if (!notice) return sendError("公告不存在", 404, ApiErrorCode.NOTICE_NOT_FOUND);

    const qualified = await findQualifiedOpportunityForNotice(ctx.dbPool, notice);
    if (!qualified) return sendError("报告不可用", 404, ApiErrorCode.REPORT_NOT_AVAILABLE);

    const fullOpportunity = await opportunitiesRepo.findFullById(Number(qualified.id));
    const opportunity = fullOpportunity || qualified;
    const row = mergeBidReportRow(notice, opportunity);

    const lang = url.searchParams.get("lang") || "zh";
    const sections = buildBidReportPreviewText(row, lang);
    const total_report_chars = estimateFullReportCharCount(row);

    // 未解锁用户服务端截断 sections 内容
    const MAX_CHARS_PER_SECTION = 500;
    const safeSections = unlock
      ? sections
      : sections.map((s: { heading: string; body: string }) => ({
          ...s,
          body: s.body.length > MAX_CHARS_PER_SECTION ? s.body.slice(0, MAX_CHARS_PER_SECTION) + "…" : s.body,
        }));

    return NextResponse.json({
      sections: safeSections,
      is_unlocked: !!unlock,
      has_full_report: true,
      total_report_chars,
    });
  }

  // GET /api/notices/:id/report — 报告下载（docx 流式）
  if (/^\/api\/notices\/\d+\/report$/.test(path)) {
    const auth = await requireUserKey(req);
    if (auth instanceof Response) return auth;

    const idMatch = path.match(/\/api\/notices\/(\d+)\/report$/);
    const noticeId = idMatch ? Number(idMatch[1]) : 0;
    const userKey = auth.userKey;

    if (!noticeId || !userKey) {
      return sendError("请先登录并指定公告", 400, ApiErrorCode.USER_REQUIRED);
    }

    const ctx = getContext();
    const { detailRepo, unlockRepo } = ctx.notice;
    const opportunitiesRepo = ctx.opportunitiesRepo;

    const unlock = await unlockRepo.findUnlock(userKey, noticeId);
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
          (f) => f.startsWith(`bid_report_${noticeId}_`) && f !== nodePath.basename(cachePath)
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

  return NextResponse.json({ code: 40404, message: "Not found" }, { status: 404 });
}
