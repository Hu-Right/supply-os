/**
 * GET /api/payment/access-records — 解锁历史（分页）
 *
 * 响应体走 lib/services/payment-history-view（平铺行→嵌套 camel），
 * 本路由不再把 repo 行整行透出。
 *
 * @module app/api/payment/access-records/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, clampLimit } from "@/shared/constants/api";
import { toAccessRecordViews } from "@/lib/services/payment-history-view";
import { canReadNoticeTranslation, maskTranslationFields } from "@/lib/services/notice-public/translation-access";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);

  const url = req.nextUrl;
  const ctx = getContext();
  const { paymentHistoryRepo } = ctx.payment;

  const lang = url.searchParams.get("lang") || "";
  const limit = clampLimit(url.searchParams.get("limit"), DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const offset = (page - 1) * limit;

  const [total, records] = await Promise.all([
    paymentHistoryRepo.countAccessRecords(auth.userId),
    paymentHistoryRepo.listAccessRecords(auth.userId, limit, offset, lang ? { lang } : null),
  ]);
  const list = toAccessRecordViews(records);
  // 解锁记录里的公告标题同样按译文权益下发（2026-11-24 口径 A+3）：
  // 无 notice_translation 的账号只拿原文标题，与列表/详情一致。
  if (!(await canReadNoticeTranslation(ctx.benefitSystemRepo, auth.userId))) {
    for (const record of list) {
      if (record.notice) maskTranslationFields(record.notice as unknown as Record<string, unknown>);
    }
  }
  return NextResponse.json({ total, page, limit, list });
});
