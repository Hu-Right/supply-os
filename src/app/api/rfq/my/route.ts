/**
 * GET /api/rfq/my — 当前用户发布的 RFQ 列表
 *
 * @module app/api/rfq/my/route
 * @description 需登录。返回当前用户创建的所有 RFQ（含 draft/published/closed）。
 */
import { RFQ_STATUS, RFQ_USER_FILTERABLE_STATUSES } from "@/shared/constants/rfq";
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const ctx = getContext();

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") || ""; // draft / published / closed / 空=全部
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(Math.max(Number(sp.get("page_size")) || 12, 4), 48);

  // 状态筛选白名单校验在路由完成；白名单外的 status 静默按「不过滤」处理（行为与搬迁前一致）
  const statusFilter = [status].every((s) => (RFQ_USER_FILTERABLE_STATUSES as readonly string[]).includes(s))
    ? status
    : "";

  const { total, rows } = await ctx.rfqRepo.getMyRfqs({ userId: auth.userId, status: statusFilter, page, pageSize });

  const items = rows.map((row) => ({
    id: Number(row.id),
    reference: String(row.reference || ""),
    title: String(row.title || ""),
    country: String(row.country || ""),
    // 注意：平台 RFQ 的 estimated_value 为“万元”数值（币种见 currency），
    // 字段名 budgetUsd 为历史残留命名（plaza 预算区间筛选复用），勿按美元字面理解。
    budgetUsd: Number(row.estimated_value) || 0,
    currency: String(row.currency || "CNY"),
    deadlineSec: Number(row.deadline_sec) || 0,
    status: String(row.rfq_status || RFQ_STATUS.DRAFT),
    // 发布日仅在已发布时有意义（历史脏数据：旧版 create 在草稿期就写了 CURDATE）
    publishedDate: String(row.rfq_status) === RFQ_STATUS.PUBLISHED && row.published_date ? String(row.published_date) : null,
    createdAt: row.create_time != null ? String(row.create_time) : null,
    quoteCount: Number(row.quote_count) || 0,
    quotePending: Number(row.quote_pending) || 0,
  }));

  return NextResponse.json({ items, total, page, page_size: pageSize });
});
