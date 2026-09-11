/**
 * POST /api/rfq/create — 创建 RFQ 采购需求
 *
 * @module app/api/rfq/create/route
 * @description 将前端 RFQ 向导表单数据写入 crm_bid_notices（notice_type='RFQ', entry_source='platform'）。
 *              需登录（JWT）。支持 draft / published 两种初始状态。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import type { ResultSetHeader } from "mysql2/promise";

/** 安全截断字符串 */
function str(val: unknown, max: number): string {
  return String(val ?? "").trim().slice(0, max);
}

/** ISO 日期 → Unix 时间戳（秒），取截止日 23:59:59 UTC */
function deadlineToSec(isoDate: string): number {
  if (!isoDate) return 0;
  const d = new Date(`${isoDate}T23:59:59Z`);
  return isNaN(d.getTime()) ? 0 : Math.floor(d.getTime() / 1000);
}

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);

  // 限流：10min/5 次（防刷）
  const rl = checkRateLimit(req, {
    windowMs: 10 * 60_000,
    maxAttempts: 5,
  }, () => `rfq-create:${auth.userId}`);
  if (rl) return rl;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    routeError(400, 40001, "请求体非法 JSON");
  }

  // ── 参数校验 ──
  const title = str(body.title, 50);
  if (title.length < 10) routeError(400, 40002, `标题至少 10 个字（当前 ${title.length}）`);

  const description = str(body.description, 5000);
  if (description.length < 50) routeError(400, 40003, `描述至少 50 个字（当前 ${description.length}）`);

  const deadline = str(body.deadline, 10);
  if (!deadline) routeError(400, 40004, "缺少报价截止时间");
  const deadlineSec = deadlineToSec(deadline);
  const nowSec = Math.floor(Date.now() / 1000);
  if (deadlineSec <= nowSec) routeError(400, 40005, "截止时间必须晚于当前时间");

  const contactName = str(body.contact_name, 100);
  if (!contactName) routeError(400, 40006, "缺少联系人姓名");

  const contactEmail = str(body.contact_email, 200);
  if (!contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    routeError(400, 40007, "联系邮箱格式无效");
  }

  const status = body.status === "published" ? "published" : "draft";
  const budgetConfidential = Boolean(body.budget_confidential);
  const budgetMin = Number(body.budget_min) || 0;
  const budgetMax = Number(body.budget_max) || 0;
  if (!budgetConfidential && budgetMin > 0 && budgetMax > 0 && budgetMin > budgetMax) {
    routeError(400, 40008, "最低预算不能高于最高预算");
  }

  // estimated_value：取预算中值（万美元），保密时为 0
  const estimatedValue = budgetConfidential ? 0 : (budgetMin + budgetMax) / 2;

  const contactPhone = str(body.contact_phone, 50);
  const provinceName = str(body.province_name, 50);
  const categoryL1Id = Number(body.category_l1_id) || null;
  const categoryL2Id = Number(body.category_l2_id) || null;
  const deliveryAddress = str(body.delivery_address, 500);
  const incoterm = str(body.incoterm, 20);
  const deliveryTime = str(body.delivery_time, 200);
  const visibility = body.visibility === "targeted" ? "targeted" : "public";

  // payment_terms / supplier_reqs：JSON 数组序列化为字符串
  const paymentTerms = Array.isArray(body.payment_terms)
    ? body.payment_terms.map((v: unknown) => str(v, 50)).filter(Boolean).join(",")
    : "";
  const supplierReqs = Array.isArray(body.supplier_reqs)
    ? body.supplier_reqs.map((v: unknown) => str(v, 100)).filter(Boolean).join(",")
    : "";

  // 将商务条款拼入 description 尾部（crm_bid_notices 无独立列，复用 description 承载）
  const businessTerms = [
    incoterm && `贸易术语: ${incoterm}`,
    deliveryTime && `交付时间: ${deliveryTime}`,
    paymentTerms && `付款方式: ${paymentTerms}`,
    deliveryAddress && `交付地点: ${deliveryAddress}`,
    supplierReqs && `供应商资质: ${supplierReqs}`,
    `可见范围: ${visibility === "public" ? "公开询价" : "定向邀约"}`,
  ].filter(Boolean).join("\n");

  const fullDescription = `${description}\n\n---\n${businessTerms}`;

  // ── 写入 crm_bid_notices ──
  const pool = getPool();

  try {
    const [result] = await pool.query(
      `INSERT INTO crm_bid_notices
        (title, description, country, province_name, category_l1_id, category_l2_id,
         notice_type, deadline_sec,
         estimated_value, published_date, rfq_status,
         contact_email, contact_phone, user_id, entry_source,
         agency)
       VALUES (?, ?, ?, ?, ?, ?, 'RFQ', ?, ?, CURDATE(), ?, ?, ?, ?, 'platform', ?)`,
      [
        title,
        fullDescription.slice(0, 10000),
        "China",
        provinceName,
        categoryL1Id,
        categoryL2Id,
        deadlineSec,
        estimatedValue,
        status,
        contactEmail,
        contactPhone,
        auth.userId ?? null,
        contactName, // agency 列暂存联系人姓名（RFQ 无机构概念）
      ],
    );

    const insertId = (result as ResultSetHeader).insertId;

    return NextResponse.json(
      { code: 0, message: "ok", data: { id: insertId } },
      { status: 201 },
    );
  } catch (err) {
    console.warn("[api/rfq/create] INSERT failed:", (err as Error).message);
    routeError(500, 50001, "创建失败，请稍后重试");
  }
});
