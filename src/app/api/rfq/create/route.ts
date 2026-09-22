/**
 * POST /api/rfq/create — 创建 RFQ 采购需求
 *
 * @module app/api/rfq/create/route
 * @description 将前端 RFQ 向导表单数据写入 crm_bid_notices（notice_type='RFQ', entry_source='platform'）。
 *              需登录（JWT）。支持 draft / published 两种初始状态。
 */
import { RFQ_STATUS } from "@/shared/constants/rfq";
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { EC_INVALID_PARAMS, EC_INTERNAL_ERROR } from "@/shared/constants/api";
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
    routeError(400, EC_INVALID_PARAMS, "请求体非法 JSON");
  }

  // ── 参数校验 ──
  const title = str(body.title, 50);
  if (title.length < 10) routeError(400, EC_INVALID_PARAMS, `标题至少 10 个字（当前 ${title.length}）`);

  const description = str(body.description, 5000);
  if (description.length < 50) routeError(400, EC_INVALID_PARAMS, `描述至少 50 个字（当前 ${description.length}）`);

  const deadline = str(body.deadline, 10);
  if (!deadline) routeError(400, EC_INVALID_PARAMS, "缺少报价截止时间");
  const deadlineSec = deadlineToSec(deadline);
  const nowSec = Math.floor(Date.now() / 1000);
  if (deadlineSec <= nowSec) routeError(400, EC_INVALID_PARAMS, "截止时间必须晚于当前时间");

  const contactName = str(body.contact_name, 100);
  if (!contactName) routeError(400, EC_INVALID_PARAMS, "缺少联系人姓名");

  const contactEmail = str(body.contact_email, 200);
  if (!contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    routeError(400, EC_INVALID_PARAMS, "联系邮箱格式无效");
  }

  const status = body.status === RFQ_STATUS.PUBLISHED ? RFQ_STATUS.PUBLISHED : RFQ_STATUS.DRAFT;
  const budgetConfidential = Boolean(body.budget_confidential);
  const budget = Number(body.budget) || 0;
  const currency = str(body.currency || "CNY", 10);

  // estimated_value：预算金额（万元人民币），保密时为 0
  const estimatedValue = budgetConfidential ? 0 : budget;

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



  // ── 写入 crm_bid_notices（商务条款走独立列，不再拼接 description）──
  const pool = getPool();

  try {
    // deadline_sec 是 crm_bid_notices 的 STORED 生成列（迁移 009：基于 deadline_ts 自动折算），
    // 不可显式写入；改为写入基色列 deadline_ts（秒）与展示列 deadline（ISO 日期串）。
    // 时间语义：create_time = 创建时刻；published_date 不在创建时写（审核通过转
    // published 时才由 submit/后台写入），避免草稿/待审核阶段误显“发布于”。
    const [result] = await pool.query(
      `INSERT INTO crm_bid_notices
        (title, description, country, province_name, category_l1_id, category_l2_id,
         notice_type, deadline, deadline_ts, create_time,
         estimated_value, currency, rfq_status,
         contact_email, contact_phone, user_id, entry_source,
         contact_name, budget_confidential,
         incoterm, delivery_time, delivery_address, payment_terms, supplier_reqs, visibility)
       VALUES (?, ?, ?, ?, ?, ?, 'RFQ', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'platform',
               ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        description.slice(0, 10000),
        "China",
        provinceName,
        categoryL1Id,
        categoryL2Id,
        deadline,
        deadlineSec,
        Math.floor(Date.now() / 1000),
        estimatedValue,
        currency,
        status,
        contactEmail,
        contactPhone,
        auth.userId ?? null,
        contactName,
        budgetConfidential ? 1 : 0,
        incoterm || null,
        deliveryTime || null,
        deliveryAddress || null,
        paymentTerms || null,
        supplierReqs || null,
        visibility,
      ],
    );

    const insertId = (result as ResultSetHeader).insertId;

    // 公告编号：平台 RFQ 此前不写 reference/notice_id（全 NULL），导致列表/详情/宽表
    // 无编号可追溯。生成 OSRFQ-{id 12位补零}，reference 与 notice_id 同值（id 唯一→两者唯一）。
    // 前缀用 OSRFQ- 而非 RFQ-：爬虫存量里已有 5 条外部编号以 RFQ- 开头（如 RFQ-CPD-26-012），
    // 共命名空间存在唯一键撞号与 daily-sync ODKU 静默覆盖风险；OSRFQ- 为外部编号体系结构上
    // 不可能出现的形态（实测全库 0 条），实现数学级隔离。存量迁移见 085/086。
    const ref = `OSRFQ-${String(insertId).padStart(12, "0")}`;
    await pool.query(
      `UPDATE crm_bid_notices SET reference = ?, notice_id = ? WHERE id = ?`,
      [ref, ref, insertId],
    );

    return NextResponse.json(
      { code: 0, message: "ok", data: { id: insertId } },
      { status: 201 },
    );
  } catch (err) {
    console.warn("[api/rfq/create] INSERT failed:", (err as Error).message);
    routeError(500, EC_INTERNAL_ERROR, "创建失败，请稍后重试");
  }
});
