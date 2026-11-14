/**
 * GET /api/rfq/list — 需求广场（公开）
 *
 * @module app/api/rfq/list/route
 * @description v2 读模型：直接读 `rfq_demand`（写模型即读模型的一部分——公开面不需要
 *              投影的翻译/路径列；搜索/SEO/宽表仍走 `bid_notices` → 宽表链路）。
 *              只返回**报价窗口内**的公开需求：published 且已开放（open_at 为空或已到）
 *              且未截止（close_at 为空或未到）；定向（targeted）一律不出现。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import { withRoute } from "@/lib/middleware/route-handler";
import { clampLimit, DEFAULT_PAGE_LIMIT } from "@/shared/constants/api";
import { DEMAND_STATUS } from "@/shared/constants/rfq-demand";
import { commodityNodeLevel, isCommodityNodeKey } from "@/lib/services/commodity/tree";
import type { RowDataPacket } from "mysql2/promise";

export const GET = withRoute(async (req: NextRequest) => {
  const rl = checkRateLimit(
    req,
    { windowMs: 60_000, maxAttempts: 60 },
    () => `rfq-list:${extractClientIp(req)}`,
  );
  if (rl) return rl;

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = clampLimit(sp.get("page_size"), DEFAULT_PAGE_LIMIT, 48);
  const q = String(sp.get("q") || "").trim().slice(0, 200);
  const province = String(sp.get("province") || "").trim().slice(0, 50);
  const categoryL1 = String(sp.get("category_l1") || "").trim().slice(0, 16);
  const sort = sp.get("sort") === "deadline" ? "deadline" : sp.get("sort") === "budget" ? "budget" : "newest";

  const nowSec = Math.floor(Date.now() / 1000);
  const conditions: string[] = [
    "d.status = ?",
    "d.visibility = 'public'",
    "(d.open_at IS NULL OR d.open_at <= ?)",
    "(d.close_at IS NULL OR d.close_at >= ?)",
  ];
  const params: unknown[] = [DEMAND_STATUS.PUBLISHED, nowSec, nowSec];

  if (q) {
    conditions.push("(d.title LIKE ? OR LEFT(d.description, 500) LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (province) {
    conditions.push("d.province_name = ?");
    params.push(province);
  }
  if (categoryL1) {
    // 非法码按空条件处理（筛选参数可手输），不 500
    if (!isCommodityNodeKey(categoryL1) || commodityNodeLevel(categoryL1) !== 1) {
      return NextResponse.json({ items: [], total: 0, page, page_size: pageSize });
    }
    conditions.push("d.category_code LIKE ?");
    params.push(`${categoryL1}%`);
  }

  const where = conditions.join(" AND ");
  const orderBy =
    sort === "deadline" ? "d.close_at ASC" : sort === "budget" ? "d.budget_amount DESC" : "d.id DESC";
  const offset = (page - 1) * pageSize;
  const pool = getPool();

  const [countRes, dataRes] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS total FROM rfq_demand d WHERE ${where}`, params),
    // quote_count 读 legacy rfq_quotes（rfq_id = 投影 notice_pk）：rfq_quote 新表当前无写入者，
    // 报价真实落点在 v1 表；P2 报价迁表时三处计数一并切回（2026-11-14 审计）
    pool.query(
      `SELECT d.id, d.reference, d.title, d.status, d.category_code,
              d.province_name, d.quantity, d.quantity_unit,
              d.budget_amount, d.budget_currency, d.budget_confidential,
              d.close_at, d.created_at,
              c1.name_zh AS category_l2_name,
              c0.name_zh AS category_l1_name,
              (SELECT COUNT(*) FROM rfq_quotes q
                WHERE q.rfq_id = d.notice_pk AND q.status = 'submitted') AS quote_count
         FROM rfq_demand d
         LEFT JOIN commodity_backbone c1 ON c1.code = d.category_code
         LEFT JOIN commodity_backbone c0 ON c0.code = LEFT(d.category_code, 6) AND c0.level = 1
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    ),
  ]);

  const total = Number((countRes[0] as RowDataPacket[])[0]?.total || 0);
  const rows = dataRes[0] as Array<RowDataPacket & {
    id: number;
    reference: string;
    title: string;
    status: string;
    category_code: string | null;
    province_name: string | null;
    quantity: string | null;
    quantity_unit: string | null;
    budget_amount: string | null;
    budget_currency: string;
    budget_confidential: number;
    close_at: number | null;
    created_at: number | null;
    category_l2_name: string | null;
    category_l1_name: string | null;
    quote_count: number;
  }>;

  const items = rows.map((r) => {
    const confidential = Number(r.budget_confidential) === 1;
    const amount = r.budget_amount == null ? null : Number(r.budget_amount);
    return {
      id: Number(r.id),
      reference: String(r.reference ?? ""),
      title: String(r.title ?? ""),
      status: String(r.status ?? ""),
      categoryCode: String(r.category_code ?? ""),
      categoryL1: String(r.category_l1_name ?? ""),
      categoryL2: String(r.category_l2_name ?? ""),
      province: String(r.province_name ?? ""),
      quantity: r.quantity == null ? null : Number(r.quantity),
      quantityUnit: String(r.quantity_unit ?? ""),
      budgetAmount: confidential ? null : amount,
      budgetConfidential: confidential,
      currency: String(r.budget_currency || "CNY"),
      closeAt: r.close_at == null ? null : Number(r.close_at),
      createdAt: r.created_at == null ? null : Number(r.created_at),
      responses: Number(r.quote_count) || 0,
    };
  });

  return NextResponse.json({ items, total, page, page_size: pageSize });
});
