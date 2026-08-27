/**
 * GET /api/notices/:id/report/preview — 报告预览（结构化 JSON 摘要）
 *
 * @module app/api/notices/[id]/report/preview/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { findQualifiedOpportunityForNotice } from "@/lib/services/notices/featured";
import {
  buildBidReportPreviewText,
  estimateFullReportCharCount,
  mergeBidReportRow,
} from "@/lib/services/bid-report";

const ApiErrorCode = {
  USER_REQUIRED: 40001,
  NOTICE_NOT_FOUND: 40404,
  REPORT_NOT_AVAILABLE: 40405,
} as const;

function sendError(message: string, status: number, code: number) {
  return NextResponse.json({ code, message, error: message }, { status });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const noticeId = Number(id);
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

  const lang = req.nextUrl.searchParams.get("lang") || "zh";
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
