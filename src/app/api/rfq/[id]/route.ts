/**
 * PATCH /api/rfq/[id] — 编辑 RFQ
 *
 * @module app/api/rfq/[id]/route
 * @description 仅创建者可操作。仅 draft / pending_review 状态可编辑。
 *              编辑后状态回退为 draft（需重新提交审核）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";

/** 安全截断字符串 */
function str(val: unknown, max: number): string {
  return String(val ?? "").trim().slice(0, max);
}

/** ISO 日期 → Unix 时间戳（秒） */
function deadlineToSec(isoDate: string): number {
  if (!isoDate) return 0;
  const d = new Date(`${isoDate}T23:59:59Z`);
  return isNaN(d.getTime()) ? 0 : Math.floor(d.getTime() / 1000);
}

export const PATCH = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);
    const { id } = await params;
    const rfqId = Number(id);
    if (!Number.isFinite(rfqId) || rfqId <= 0) {
      routeError(400, 40001, "无效的 RFQ ID");
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      routeError(400, 40002, "请求体非法 JSON");
    }

    const pool = getPool();

    // 权限 + 状态校验
    const [existing] = await pool.query(
      `SELECT id, rfq_status, user_id FROM crm_bid_notices
       WHERE id = ? AND notice_type = 'RFQ' LIMIT 1`,
      [rfqId],
    );
    const row = (existing as RowDataPacket[])[0];
    if (!row) routeError(404, 40003, "RFQ 不存在");
    if (Number(row.user_id) !== auth.userId) routeError(403, 40004, "无权操作此 RFQ");
    if (row.rfq_status !== "draft" && row.rfq_status !== "pending_review") {
      routeError(400, 40005, "仅草稿或待审核状态可编辑");
    }

    // ── 构建 UPDATE 字段 ──
    const updates: string[] = [];
    const updateParams: unknown[] = [];

    if (body.title !== undefined) {
      const title = str(body.title, 50);
      if (title.length < 10) routeError(400, 40006, `标题至少 10 个字`);
      updates.push("title = ?");
      updateParams.push(title);
    }

    if (body.description !== undefined) {
      const desc = str(body.description, 5000);
      if (desc.length < 50) routeError(400, 40007, `描述至少 50 个字`);
      updates.push("description = ?");
      updateParams.push(desc);
    }

    if (body.deadline !== undefined) {
      const deadline = str(body.deadline, 10);
      const deadlineSec = deadlineToSec(deadline);
      if (deadlineSec <= Math.floor(Date.now() / 1000)) {
        routeError(400, 40008, "截止时间必须晚于当前时间");
      }
      updates.push("deadline_sec = ?");
      updateParams.push(deadlineSec);
    }

    if (body.budget_min !== undefined || body.budget_max !== undefined) {
      const budgetMin = Number(body.budget_min) || 0;
      const budgetMax = Number(body.budget_max) || 0;
      const confidential = Boolean(body.budget_confidential);
      const estimatedValue = confidential ? 0 : (budgetMin + budgetMax) / 2;
      updates.push("estimated_value = ?");
      updateParams.push(estimatedValue);
    }

    if (body.province_name !== undefined) {
      updates.push("province_name = ?");
      updateParams.push(str(body.province_name, 50));
    }

    if (body.category_l1_id !== undefined) {
      updates.push("category_l1_id = ?");
      updateParams.push(Number(body.category_l1_id) || null);
    }

    if (body.category_l2_id !== undefined) {
      updates.push("category_l2_id = ?");
      updateParams.push(Number(body.category_l2_id) || null);
    }

    if (body.contact_email !== undefined) {
      updates.push("contact_email = ?");
      updateParams.push(str(body.contact_email, 200));
    }

    if (body.contact_phone !== undefined) {
      updates.push("contact_phone = ?");
      updateParams.push(str(body.contact_phone, 50));
    }

    if (updates.length === 0) {
      routeError(400, 40009, "无有效更新字段");
    }

    // 编辑后状态回退为 draft
    updates.push("rfq_status = 'draft'");

    const [result] = await pool.query(
      `UPDATE crm_bid_notices SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`,
      [...updateParams, rfqId, auth.userId],
    );

    if ((result as ResultSetHeader).affectedRows === 0) {
      routeError(500, 50001, "更新失败");
    }

    return NextResponse.json({ code: 0, message: "ok" });
  },
);
