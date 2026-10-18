/**
 * POST /api/rfq/[id]/invite — 采购方对其已发布需求发起「邀约匹配供应商报价」
 *
 * @module app/api/rfq/[id]/invite/route
 * @description 仅创建者、仅 published。两步式（外发副作用需人工放行）：
 *   - action:"preview" → dryRun，返回将触达的策略与供应商名单（公司名 + 品类匹配度），不发送/不写库；
 *   - action:"send"    → 邮件邀约匹配供应商（写 crm_rfq_outreach 去重）；若需求为 targeted，
 *                        同时把这些供应商写入 crm_rfq_invites 报价白名单。
 *   public 需求只触达、不改可见性、不写 invites。
 */
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS, EC_NOT_FOUND, EC_FORBIDDEN } from "@/shared/constants/api";
import { RFQ_STATUS } from "@/shared/constants/rfq";
import type { RowDataPacket } from "mysql2/promise";
import {
  outreachPublishedRfq,
  addInvites,
  DEFAULT_MATCH_LIMIT,
} from "@/lib/services/rfq-outreach";

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
    const action = body.action === "send" ? "send" : "preview";
    const rawLimit = Number(body.limit);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : DEFAULT_MATCH_LIMIT;

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT user_id, rfq_status, visibility FROM crm_bid_notices
        WHERE id = ? AND notice_type = 'RFQ' AND entry_source = 'platform' LIMIT 1`,
      [rfqId],
    );
    const rfq = (rows as RowDataPacket[])[0];
    if (!rfq) routeError(404, EC_NOT_FOUND, "RFQ 不存在");
    if (Number(rfq.user_id) !== auth.userId) routeError(403, EC_FORBIDDEN, "仅创建者可邀约供应商");
    if (String(rfq.rfq_status) !== RFQ_STATUS.PUBLISHED) routeError(409, EC_FORBIDDEN, "需求未发布，无法邀约");

    const res = await outreachPublishedRfq(pool, { rfqId, limit, dryRun: action !== "send" });

    if (action === "preview") {
      return NextResponse.json({
        code: 0,
        message: "ok",
        data: {
          strategy: res.strategy,
          total: res.recipients,
          candidates: (res.preview ?? []).map((p) => ({ company: p.company, matchCount: p.matchCount })),
        },
      });
    }

    // send：public 仅触达；targeted 额外写报价白名单（用预览得到的命中供应商）
    let invited = 0;
    if (String(rfq.visibility) === "targeted") {
      const ids = (res.preview ?? []).map((p) => p.userId);
      invited = await addInvites(pool, rfqId, auth.userId, ids);
    }

    return NextResponse.json({
      code: 0,
      message: "ok",
      data: { emailed: res.emailed, skipped: res.skipped, invited, strategy: res.strategy },
    });
  },
);
