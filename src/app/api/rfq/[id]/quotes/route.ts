/**
 * POST /api/rfq/[id]/quotes — 认证供应商提交/更新报价
 * GET  /api/rfq/[id]/quotes — 采购方（创建者）查看该 RFQ 报价汇总（密封比价）
 *
 * @module app/api/rfq/[id]/quotes/route
 */
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import {
  EC_INVALID_PARAMS,
  EC_NOT_FOUND,
  EC_FORBIDDEN,
  EC_ENTERPRISE_NOT_BOUND,
} from "@/shared/constants/api";
import {
  getQuoteableRfq,
  checkQuoteEligibility,
  submitQuote,
  listQuotesForBuyer,
} from "@/lib/services/rfq-quotes";

function str(val: unknown, max: number): string {
  return String(val ?? "").trim().slice(0, max);
}

export const POST = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);
    const { id } = await params;
    const rfqId = Number(id);
    if (!Number.isFinite(rfqId) || rfqId <= 0) routeError(400, EC_INVALID_PARAMS, "无效的 RFQ ID");

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      routeError(400, EC_INVALID_PARAMS, "请求体非法 JSON");
    }

    const price = Number(body.price);
    if (!Number.isFinite(price) || price <= 0) routeError(400, EC_INVALID_PARAMS, "报价金额必须为正数");

    const pool = getPool();
    const rfq = await getQuoteableRfq(pool, rfqId);
    const elig = await checkQuoteEligibility(pool, rfq, auth.userId);
    if (!elig.ok) {
      if (elig.reason === "not_found") routeError(404, EC_NOT_FOUND, "RFQ 不存在");
      if (elig.reason === "not_supplier") routeError(403, EC_ENTERPRISE_NOT_BOUND, "仅已认证企业供应商可报价");
      if (elig.reason === "not_invited") routeError(403, EC_FORBIDDEN, "该需求为定向邀约，你未被邀约");
      if (elig.reason === "awarded") routeError(409, EC_FORBIDDEN, "该需求已完成供应商选定，不再接受报价");
      routeError(400, EC_INVALID_PARAMS, "该需求当前不接受报价");
    }

    const leadRaw = body.lead_time_days;
    const leadTimeDays = leadRaw == null || leadRaw === "" ? null : Number(leadRaw);
    const { quoteId } = await submitQuote(pool, {
      rfqId,
      userId: auth.userId,
      price,
      currency: str(body.currency || "CNY", 10) || "CNY",
      leadTimeDays: leadTimeDays != null && Number.isFinite(leadTimeDays) ? leadTimeDays : null,
      deliveryTerms: str(body.delivery_terms, 200) || null,
      note: str(body.note, 1000) || null,
      buyerUserId: rfq!.userId,
      rfqTitle: rfq!.title,
      buyerEmail: rfq!.contactEmail,
    });

    return NextResponse.json({ code: 0, message: "ok", data: { quoteId } }, { status: 201 });
  },
);

export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);
    const { id } = await params;
    const rfqId = Number(id);
    if (!Number.isFinite(rfqId) || rfqId <= 0) routeError(400, EC_INVALID_PARAMS, "无效的 RFQ ID");

    const pool = getPool();
    const rfq = await getQuoteableRfq(pool, rfqId);
    if (!rfq) routeError(404, EC_NOT_FOUND, "RFQ 不存在");
    if (rfq!.userId !== auth.userId) routeError(403, EC_FORBIDDEN, "仅创建者可查看报价汇总");

    const items = await listQuotesForBuyer(pool, rfqId);
    return NextResponse.json({ code: 0, message: "ok", data: { items, total: items.length } });
  },
);
