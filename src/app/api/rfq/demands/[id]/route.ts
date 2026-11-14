/**
 * GET   /api/rfq/demands/[id] — 需求详情（owner / 受邀方 / 公开）
 * PATCH /api/rfq/demands/[id] — 编辑（仅 draft / rejected）
 *
 * @module app/api/rfq/demands/[id]/route
 * @description 可见性规则（v2）：
 *              - owner：全部状态可见（含联系方式）；
 *              - 公开需求：published / evaluation 可见，closed 一律 404；
 *              - 定向需求：只对 owner 与受邀供应商可见完整内容，其余返回**摘要**（不含描述/预算/条款）。
 */
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import {
  EC_FORBIDDEN,
  EC_INVALID_PARAMS,
  EC_RFQ_NOT_FOUND,
  EC_RFQ_STATE_INVALID,
  EC_INTERNAL_ERROR,
} from "@/shared/constants/api";
import { DEMAND_STATUS } from "@/shared/constants/rfq-demand";
import { toDetailView, toRestrictedView, type DemandRowLike } from "@/lib/services/rfq/dto";
import { normalizeUpdatePayload } from "@/lib/services/rfq/payload";
import { updateDemand } from "@/lib/services/rfq/update";
import type { RowDataPacket } from "mysql2/promise";

interface DemandDetailRow extends RowDataPacket, DemandRowLike {
  buyer_user_id: number;
  category_l1_name: string | null;
  category_l2_name: string | null;
}

const PUBLIC_VISIBLE: readonly string[] = [DEMAND_STATUS.PUBLISHED, DEMAND_STATUS.EVALUATION];

export const GET = withRoute<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const demandId = Number(id);
  if (!Number.isFinite(demandId) || demandId <= 0) {
    routeError(400, EC_INVALID_PARAMS, "无效的需求 ID");
  }

  // 可选登录：未登录只能看公开需求
  let userId: number | null = null;
  try {
    userId = (await requireUserKeyOrThrow(req)).userId;
  } catch {
    // 未登录：按匿名处理
  }

  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT d.*, c1.name_zh AS category_l2_name, c0.name_zh AS category_l1_name
       FROM rfq_demand d
       LEFT JOIN commodity_backbone c1 ON c1.code = d.category_code
       LEFT JOIN commodity_backbone c0 ON c0.code = LEFT(d.category_code, 6) AND c0.level = 1
      WHERE d.id = ?
      LIMIT 1`,
    [demandId],
  );
  const row = (rows as DemandDetailRow[])[0];
  if (!row) routeError(404, EC_RFQ_NOT_FOUND, "需求不存在");

  const isOwner = userId !== null && Number(row.buyer_user_id) === userId;
  const status = String(row.status ?? DEMAND_STATUS.DRAFT);

  if (!isOwner && !PUBLIC_VISIBLE.includes(status)) {
    routeError(404, EC_RFQ_NOT_FOUND, "需求不存在或未公开");
  }

  const targeted = String(row.visibility || "public") === "targeted";
  if (!isOwner && targeted) {
    let invited = false;
    if (userId !== null) {
      const [invites] = await pool.query(
        `SELECT 1 FROM rfq_invitation
          WHERE demand_id = ? AND supplier_user_id = ? AND unsubscribed_at IS NULL LIMIT 1`,
        [demandId, userId],
      );
      invited = (invites as RowDataPacket[]).length > 0;
    }
    if (!invited) return NextResponse.json(toRestrictedView(row));
  }

  return NextResponse.json(toDetailView(row, { isOwner }));
});

export const PATCH = withRoute<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const demandId = Number(id);
  if (!Number.isFinite(demandId) || demandId <= 0) {
    routeError(400, EC_INVALID_PARAMS, "无效的需求 ID");
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    routeError(400, EC_INVALID_PARAMS, "请求体非法 JSON");
  }

  const patch = normalizeUpdatePayload(body);

  try {
    const result = await updateDemand(getPool(), {
      demandId,
      buyerUserId: auth.userId,
      patch,
    });

    if (!result.ok) {
      switch (result.reason) {
        case "not_found":
          routeError(404, EC_RFQ_NOT_FOUND, "需求不存在");
          break;
        case "forbidden":
          routeError(403, EC_FORBIDDEN, "无权操作此需求");
          break;
        case "not_editable":
          routeError(409, EC_RFQ_STATE_INVALID, "仅草稿或审核未通过的需求可编辑");
          break;
        default:
          routeError(400, EC_INVALID_PARAMS, result.message || "参数非法");
      }
    }

    return NextResponse.json({ status: result.status, changed: result.changed });
  } catch (err) {
    console.warn("[api/rfq/demands/[id]] update failed:", (err as Error).message);
    routeError(500, EC_INTERNAL_ERROR, "保存失败，请稍后重试");
  }
});

