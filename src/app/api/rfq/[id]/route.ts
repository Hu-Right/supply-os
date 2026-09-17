/**
 * GET  /api/rfq/[id]  — RFQ 详情
 * PATCH /api/rfq/[id] — 编辑 RFQ
 *
 * @module app/api/rfq/[id]/route
 * @description GET：published 状态公开可访问（联系人信息不返回）；
 *              创建者可查看自己 draft/pending_review/closed 的完整信息。
 *              PATCH：仅创建者可操作。仅 draft / pending_review 状态可编辑。
 *              编辑后状态回退为 draft（需重新提交审核）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS, EC_NOT_FOUND, EC_FORBIDDEN, EC_INTERNAL_ERROR } from "@/shared/constants/api";
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

export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const { id } = await params;
    const rfqId = Number(id);
    if (!Number.isFinite(rfqId) || rfqId <= 0) {
      routeError(400, EC_INVALID_PARAMS, "无效的 RFQ ID");
    }

    // 可选登录：创建者可看未发布内容与联系方式
    let userId: number | null = null;
    try {
      const auth = await requireUserKeyOrThrow(req);
      userId = auth.userId;
    } catch {
      // 未登录：仅 published
    }

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT n.id, n.title, n.description, n.country, n.province_name,
              n.category_l1_id, n.category_l2_id,
              c1.title_zh AS category_l1_name,
              c2.title_zh AS category_l2_name,
              n.budget_confidential, n.currency,
              n.incoterm, n.delivery_time, n.delivery_address,
              n.payment_terms, n.supplier_reqs, n.visibility,
              n.estimated_value, n.deadline_sec, n.rfq_status,
              n.published_date, n.user_id,
              n.contact_name, n.contact_email, n.contact_phone
       FROM crm_bid_notices n
       LEFT JOIN crm_unspsc_codes c1 ON c1.id = n.category_l1_id
       LEFT JOIN crm_unspsc_codes c2 ON c2.id = n.category_l2_id
       WHERE n.id = ? AND n.notice_type = 'RFQ' AND n.entry_source = 'platform'
       LIMIT 1`,
      [rfqId],
    );
    const row = (rows as RowDataPacket[])[0];
    if (!row) routeError(404, EC_NOT_FOUND, "RFQ 不存在");

    const isOwner = userId !== null && Number(row.user_id) === userId;
    if (row.rfq_status !== "published" && !isOwner) {
      routeError(404, EC_NOT_FOUND, "RFQ 不存在或未公开");
    }

    const confidential = Number(row.budget_confidential) === 1;
    return NextResponse.json({
      code: 0,
      message: "ok",
      data: {
        id: Number(row.id),
        title: String(row.title || ""),
        description: String(row.description || ""),
        status: String(row.rfq_status || "draft"),
        categoryL1: String(row.category_l1_name || ""),
        categoryL2: String(row.category_l2_name || ""),
        province: String(row.province_name || ""),
        budget: confidential ? null : Number(row.estimated_value) || 0,
        budgetConfidential: confidential,
        currency: String(row.currency || "CNY"),
        incoterm: String(row.incoterm || ""),
        deliveryTime: String(row.delivery_time || ""),
        deliveryAddress: String(row.delivery_address || ""),
        paymentTerms: String(row.payment_terms || "").split(",").filter(Boolean),
        supplierReqs: String(row.supplier_reqs || "").split(",").filter(Boolean),
        visibility: String(row.visibility || "public"),
        deadlineSec: Number(row.deadline_sec) || 0,
        publishedDate: row.published_date ? String(row.published_date) : null,
        isOwner,
        // 联系方式仅创建者可见（编辑回显用）
        ...(isOwner ? {
          contactName: String(row.contact_name || ""),
          contactEmail: String(row.contact_email || ""),
          contactPhone: String(row.contact_phone || ""),
        } : {}),
      },
    });
  },
);

export const PATCH = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);
    const { id } = await params;
    const rfqId = Number(id);
    if (!Number.isFinite(rfqId) || rfqId <= 0) {
      routeError(400, EC_INVALID_PARAMS, "无效的 RFQ ID");
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      routeError(400, EC_INVALID_PARAMS, "请求体非法 JSON");
    }

    const pool = getPool();

    // 权限 + 状态校验
    const [existing] = await pool.query(
      `SELECT id, rfq_status, user_id FROM crm_bid_notices
       WHERE id = ? AND notice_type = 'RFQ' LIMIT 1`,
      [rfqId],
    );
    const row = (existing as RowDataPacket[])[0];
    if (!row) routeError(404, EC_NOT_FOUND, "RFQ 不存在");
    if (Number(row.user_id) !== auth.userId) routeError(403, EC_FORBIDDEN, "无权操作此 RFQ");
    if (row.rfq_status !== "draft" && row.rfq_status !== "pending_review") {
      routeError(400, EC_INVALID_PARAMS, "仅草稿或待审核状态可编辑");
    }

    // ── 构建 UPDATE 字段 ──
    const updates: string[] = [];
    const updateParams: unknown[] = [];

    if (body.title !== undefined) {
      const title = str(body.title, 50);
      if (title.length < 10) routeError(400, EC_INVALID_PARAMS, `标题至少 10 个字`);
      updates.push("title = ?");
      updateParams.push(title);
    }

    if (body.description !== undefined) {
      const desc = str(body.description, 5000);
      if (desc.length < 50) routeError(400, EC_INVALID_PARAMS, `描述至少 50 个字`);
      updates.push("description = ?");
      updateParams.push(desc);
    }

    if (body.deadline !== undefined) {
      const deadline = str(body.deadline, 10);
      const deadlineSec = deadlineToSec(deadline);
      if (deadlineSec <= Math.floor(Date.now() / 1000)) {
        routeError(400, EC_INVALID_PARAMS, "截止时间必须晚于当前时间");
      }
      updates.push("deadline_sec = ?");
      updateParams.push(deadlineSec);
    }

    if (body.budget !== undefined || body.budget_confidential !== undefined || body.currency !== undefined) {
      const budget = Number(body.budget) || 0;
      const confidential = Boolean(body.budget_confidential);
      const estimatedValue = confidential ? 0 : budget;
      updates.push("budget_confidential = ?", "estimated_value = ?");
      updateParams.push(confidential ? 1 : 0, estimatedValue);
    }

    if (body.currency !== undefined) {
      updates.push("currency = ?");
      updateParams.push(str(body.currency || "CNY", 10));
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

    if (body.contact_name !== undefined) {
      const contactName = str(body.contact_name, 100);
      if (!contactName) routeError(400, EC_INVALID_PARAMS, "联系人姓名不能为空");
      updates.push("contact_name = ?");
      updateParams.push(contactName);
    }



    if (body.incoterm !== undefined) {
      updates.push("incoterm = ?");
      updateParams.push(str(body.incoterm, 20) || null);
    }

    if (body.delivery_time !== undefined) {
      updates.push("delivery_time = ?");
      updateParams.push(str(body.delivery_time, 200) || null);
    }

    if (body.delivery_address !== undefined) {
      updates.push("delivery_address = ?");
      updateParams.push(str(body.delivery_address, 500) || null);
    }

    if (body.payment_terms !== undefined) {
      const paymentTerms = Array.isArray(body.payment_terms)
        ? body.payment_terms.map((v: unknown) => str(v, 50)).filter(Boolean).join(",")
        : "";
      updates.push("payment_terms = ?");
      updateParams.push(paymentTerms || null);
    }

    if (body.supplier_reqs !== undefined) {
      const supplierReqs = Array.isArray(body.supplier_reqs)
        ? body.supplier_reqs.map((v: unknown) => str(v, 100)).filter(Boolean).join(",")
        : "";
      updates.push("supplier_reqs = ?");
      updateParams.push(supplierReqs || null);
    }

    if (body.visibility !== undefined) {
      updates.push("visibility = ?");
      updateParams.push(body.visibility === "targeted" ? "targeted" : "public");
    }

    if (updates.length === 0) {
      routeError(400, EC_INVALID_PARAMS, "无有效更新字段");
    }

    // 编辑后状态回退为 draft
    updates.push("rfq_status = 'draft'");

    const [result] = await pool.query(
      `UPDATE crm_bid_notices SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`,
      [...updateParams, rfqId, auth.userId],
    );

    if ((result as ResultSetHeader).affectedRows === 0) {
      routeError(500, EC_INTERNAL_ERROR, "更新失败");
    }

    return NextResponse.json({ code: 0, message: "ok" });
  },
);
