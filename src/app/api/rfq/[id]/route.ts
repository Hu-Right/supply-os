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
import { RFQ_STATUS } from "@/shared/constants/rfq";
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS, EC_NOT_FOUND, EC_FORBIDDEN, EC_INTERNAL_ERROR } from "@/shared/constants/api";
import { normalizeBackboneNodeKey } from "@/lib/services/commodity/backbone-path";
import { isCommodityNodeKey } from "@/lib/services/commodity/tree";
import type { RfqPatchFields } from "@/lib/repos/rfq.repo";

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

    const ctx = getContext();
    const row = await ctx.rfqRepo.getRfqDetailById(rfqId);
    if (!row) routeError(404, EC_NOT_FOUND, "RFQ 不存在");

    const isOwner = userId !== null && Number(row.user_id) === userId;
    if (row.rfq_status !== RFQ_STATUS.PUBLISHED && !isOwner) {
      routeError(404, EC_NOT_FOUND, "RFQ 不存在或未公开");
    }

    const confidential = Number(row.budget_confidential) === 1;
    return NextResponse.json({
      id: Number(row.id),
      reference: String(row.reference || ""),
      title: String(row.title || ""),
      description: String(row.description || ""),
      status: String(row.rfq_status || RFQ_STATUS.DRAFT),
      categoryCode: String(row.category_code || ""),
      categoryL1: String(row.category_l1_name || ""),
      categoryL2: String(row.category_name || ""),
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
      // 发布日仅对已发布记录输出（旧数据可能在草稿期就写了 published_date）
      publishedDate: String(row.rfq_status) === RFQ_STATUS.PUBLISHED && row.published_date ? String(row.published_date) : null,
      isOwner,
      // 联系方式仅创建者可见（编辑回显用）
      ...(isOwner ? {
        contactName: String(row.contact_name || ""),
        contactEmail: String(row.contact_email || ""),
        contactPhone: String(row.contact_phone || ""),
      } : {}),
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

    const ctx = getContext();

    // 权限 + 状态校验
    const row = await ctx.rfqRepo.getRfqStateById(rfqId);
    if (!row) routeError(404, EC_NOT_FOUND, "RFQ 不存在");
    if (Number(row.user_id) !== auth.userId) routeError(403, EC_FORBIDDEN, "无权操作此 RFQ");
    if (row.rfq_status !== RFQ_STATUS.DRAFT && row.rfq_status !== RFQ_STATUS.PENDING_REVIEW && row.rfq_status !== RFQ_STATUS.REJECTED) {
      routeError(400, EC_INVALID_PARAMS, "仅草稿、待审核或审核未通过状态可编辑");
    }

    // ── 构建 UPDATE 字段（字段级校验与取值在路由；SET 片段拼装在 repo 层）──
    const fields: RfqPatchFields = {};

    if (body.title !== undefined) {
      const title = str(body.title, 50);
      if (title.length < 10) routeError(400, EC_INVALID_PARAMS, `标题至少 10 个字`);
      fields.title = title;
    }

    if (body.description !== undefined) {
      const desc = str(body.description, 5000);
      if (desc.length < 50) routeError(400, EC_INVALID_PARAMS, `描述至少 50 个字`);
      fields.description = desc;
    }

    if (body.deadline !== undefined) {
      const deadline = str(body.deadline, 10);
      const deadlineSec = deadlineToSec(deadline);
      if (deadlineSec <= Math.floor(Date.now() / 1000)) {
        routeError(400, EC_INVALID_PARAMS, "截止时间必须晚于当前时间");
      }
      // deadline_sec 为生成列不可写；写基线 deadline_ts + 展示 deadline
      fields.deadline = { display: deadline, ts: deadlineSec };
    }

    if (body.budget !== undefined || body.budget_confidential !== undefined || body.currency !== undefined) {
      const budget = Number(body.budget) || 0;
      const confidential = Boolean(body.budget_confidential);
      const estimatedValue = confidential ? 0 : budget;
      fields.budget = { confidential, estimatedValue };
    }

    if (body.currency !== undefined) {
      fields.currency = str(body.currency || "CNY", 10);
    }

    if (body.delivery_address !== undefined) {
      // 交付地点：手动填写完整地址（province_name 写入已退役，历史行仅读）
      const deliveryAddress = str(body.delivery_address, 500);
      if (!deliveryAddress) routeError(400, EC_INVALID_PARAMS, "交付地点不能为空");
      fields.deliveryAddress = deliveryAddress;
    }

    if (body.category_code !== undefined) {
      // UGT 最深节点码（旧 category_l1_id/l2_id 字典 id 参数随旧品类字典退役停用）
      const categoryCode = normalizeBackboneNodeKey(str(body.category_code, 24));
      if (categoryCode && !isCommodityNodeKey(categoryCode)) {
        routeError(400, EC_INVALID_PARAMS, "品目分类码非法（需为 UGT 骨架节点码）");
      }
      fields.categoryCode = categoryCode || null;
    }

    if (body.contact_email !== undefined) {
      fields.contactEmail = str(body.contact_email, 200);
    }

    if (body.contact_phone !== undefined) {
      fields.contactPhone = str(body.contact_phone, 50);
    }

    if (body.contact_name !== undefined) {
      const contactName = str(body.contact_name, 100);
      if (!contactName) routeError(400, EC_INVALID_PARAMS, "联系人姓名不能为空");
      fields.contactName = contactName;
    }



    if (body.incoterm !== undefined) {
      fields.incoterm = str(body.incoterm, 20) || null;
    }

    if (body.delivery_time !== undefined) {
      fields.deliveryTime = str(body.delivery_time, 200) || null;
    }

    if (body.payment_terms !== undefined) {
      const paymentTerms = Array.isArray(body.payment_terms)
        ? body.payment_terms.map((v: unknown) => str(v, 50)).filter(Boolean).join(",")
        : "";
      fields.paymentTerms = paymentTerms || null;
    }

    if (body.supplier_reqs !== undefined) {
      const supplierReqs = Array.isArray(body.supplier_reqs)
        ? body.supplier_reqs.map((v: unknown) => str(v, 100)).filter(Boolean).join(",")
        : "";
      fields.supplierReqs = supplierReqs || null;
    }

    if (body.visibility !== undefined) {
      fields.visibility = body.visibility === "targeted" ? "targeted" : "public";
    }

    if (Object.keys(fields).length === 0) {
      routeError(400, EC_INVALID_PARAMS, "无有效更新字段");
    }

    // 编辑后状态回退为 draft（参数化：裸拼 draft 会被 MySQL 当作列名）
    const affected = await ctx.rfqRepo.updateRfqFields({
      rfqId,
      userId: auth.userId,
      fields,
      statusTo: RFQ_STATUS.DRAFT,
    });

    if (affected === 0) {
      routeError(500, EC_INTERNAL_ERROR, "更新失败");
    }

    return NextResponse.json({ ok: true });
  },
);
