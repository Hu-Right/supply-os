/**
 * GET /api/rfq/list — RFQ 需求广场列表
 *
 * @module app/api/rfq/list/route
 * @description 从 crm_bid_notices 查询 entry_source='platform' AND notice_type='RFQ' AND rfq_status='published' 的记录。
 *              替代旧版前端 PLAZA_RFQS 静态数组。
 */
import { RFQ_STATUS } from "@/shared/constants/rfq";
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import { withRoute } from "@/lib/middleware/route-handler";
import { formatDeadlineDateYMD, currencySymbol } from "@/shared/utils/format";
import type { RowDataPacket } from "mysql2/promise";

const MYSQL_TIMEOUT_MS = 10_000;

/** estimated_value + currency → 展示文案（平台预算以“万元”为单位，与设置页口径一致） */
function formatBudget(value: number, currency: string): string {
  if (!value || value <= 0) return "预算保密";
  return `${currencySymbol(currency)}${Math.round(value)} 万`;
}

export const GET = withRoute(async (req: NextRequest) => {
  const rl = checkRateLimit(req, { windowMs: 60_000, maxAttempts: 60 }, () => `rfq-list:${extractClientIp(req)}`);
  if (rl) return rl;

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(Math.max(Number(sp.get("page_size")) || 12, 4), 48);
  const q = String(sp.get("q") || "").trim().slice(0, 200);
  const province = String(sp.get("province") || "").trim().slice(0, 50);
  const categoryL1 = sp.get("category_l1") ? Number(sp.get("category_l1")) : undefined;
  const sort = sp.get("sort") === "deadline" ? "deadline" : sp.get("sort") === "budget" ? "budget" : "newest";
  const locale = String(sp.get("locale") || "zh");

  const pool = getPool();

  // ── WHERE ──
  // 状态值必须参数化：裸拼 `rfq_status = published` 会被 MySQL 当作列名（ER_BAD_FIELD_ERROR）
  const conditions: string[] = [
    "n.notice_type = 'RFQ'",
    "n.entry_source = 'platform'",
    "n.rfq_status = ?",
    "(n.deadline_sec = 0 OR n.deadline_sec >= UNIX_TIMESTAMP(NOW()))",
  ];
  const params: unknown[] = [RFQ_STATUS.PUBLISHED];

  if (q) {
    conditions.push("(n.title LIKE ? OR LEFT(n.description, 500) LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (province) {
    conditions.push("n.province_name = ?");
    params.push(province);
  }
  if (categoryL1) {
    conditions.push("n.category_l1_id = ?");
    params.push(categoryL1);
  }

  const whereSql = conditions.join(" AND ");
  const orderBy = sort === "deadline" ? "n.deadline_sec ASC" : sort === "budget" ? "n.estimated_value DESC" : "n.id DESC";
  const offset = (page - 1) * pageSize;

  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`RFQ list timeout ${MYSQL_TIMEOUT_MS}ms`)), MYSQL_TIMEOUT_MS));

    const [countResult, dataResult] = await Promise.all([
      Promise.race([pool.query(`SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE ${whereSql}`, params), timeout]),
      Promise.race([
        pool.query(
          `SELECT n.id, n.reference, n.title, n.country, n.province_name,
                  n.category_l1_id, n.category_l2_id,
                  c1.title_zh AS category_l1_name,
                  c2.title_zh AS category_l2_name,
                  n.estimated_value, n.currency, n.deadline_sec, n.is_featured, n.agency
           FROM crm_bid_notices n
           LEFT JOIN crm_unspsc_codes c1 ON c1.id = n.category_l1_id
           LEFT JOIN crm_unspsc_codes c2 ON c2.id = n.category_l2_id
           WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
          [...params, pageSize, offset],
        ),
        timeout,
      ]),
    ]);
    // pool.query 的 Promise 解析为 [rows, fields] 元组；取每个结果的 [0] 才是真实行数组
    const countRows = (countResult as [RowDataPacket[], unknown])[0];
    const rows = (dataResult as [RowDataPacket[], unknown])[0];

    const total = Number(countRows[0]?.total || 0);

    const items = rows.map((row) => {
      const province = String(row.province_name || "");
      const catL1 = String(row.category_l1_name || "");
      return {
        id: Number(row.id),
        reference: String(row.reference || ""),
        industry: catL1,
        tag: catL1,
        title: String(row.title || ""),
        countryZh: province || "中国",
        countryEn: "China",
        province,
        categoryL1: catL1,
        categoryL2: String(row.category_l2_name || ""),
        budgetDisplay: formatBudget(Number(row.estimated_value) || 0, String(row.currency || "CNY")),
        budgetUsd: Number(row.estimated_value) || 0,
        currency: String(row.currency || "CNY"),
        deadline: formatDeadlineDateYMD(Number(row.deadline_sec) || 0, { utc: true, emptyText: "" }),
        responses: 0,
        boosted: Boolean(row.is_featured),
      };
    });

    return NextResponse.json({ items, total, page, page_size: pageSize });
  } catch (err) {
    console.warn("[api/rfq/list] failed:", (err as Error).message);
    return NextResponse.json({ items: [], total: 0, page, page_size: pageSize });
  }
});
