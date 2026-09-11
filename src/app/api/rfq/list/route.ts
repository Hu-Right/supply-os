/**
 * GET /api/rfq/list — RFQ 需求广场列表
 *
 * @module app/api/rfq/list/route
 * @description 从 crm_bid_notices 查询 entry_source='platform' AND notice_type='RFQ' AND rfq_status='published' 的记录。
 *              替代旧版前端 PLAZA_RFQS 静态数组。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import type { RowDataPacket } from "mysql2/promise";

const MYSQL_TIMEOUT_MS = 10_000;

/** deadline_sec → ISO 日期 yyyy-MM-dd */
function formatDeadline(deadlineSec: number): string {
  if (!deadlineSec || deadlineSec <= 0) return "";
  const d = new Date(deadlineSec * 1000);
  if (isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** estimated_value → 展示文案 */
function formatBudget(valueUsd: number): string {
  if (!valueUsd || valueUsd <= 0) return "预算保密";
  if (valueUsd < 1) return `USD ${Math.round(valueUsd * 100)} 万以下`;
  return `USD ${Math.round(valueUsd)} 万`;
}

export async function GET(req: NextRequest) {
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
  const conditions: string[] = [
    "n.notice_type = 'RFQ'",
    "n.entry_source = 'platform'",
    "n.rfq_status = 'published'",
    "(n.deadline_sec = 0 OR n.deadline_sec >= UNIX_TIMESTAMP(NOW()))",
  ];
  const params: unknown[] = [];

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

    const [countRows, dataRows] = await Promise.all([
      Promise.race([pool.query(`SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE ${whereSql}`, params), timeout]),
      Promise.race([
        pool.query(
          `SELECT n.id, n.title, n.country, n.province_name,
                  n.category_l1_id, n.category_l2_id,
                  c1.title_zh AS category_l1_name,
                  c2.title_zh AS category_l2_name,
                  n.estimated_value, n.deadline_sec, n.is_featured, n.agency
           FROM crm_bid_notices n
           LEFT JOIN crm_unspsc_codes c1 ON c1.id = n.category_l1_id
           LEFT JOIN crm_unspsc_codes c2 ON c2.id = n.category_l2_id
           WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
          [...params, pageSize, offset],
        ),
        timeout,
      ]),
    ]) as [RowDataPacket[], RowDataPacket[]];

    const total = Number((countRows as RowDataPacket[])[0]?.total || 0);
    const rows = dataRows as RowDataPacket[];

    const items = rows.map((row) => {
      const province = String(row.province_name || "");
      const catL1 = String(row.category_l1_name || "");
      return {
        id: Number(row.id),
        industry: catL1,
        tag: catL1,
        title: String(row.title || ""),
        countryZh: province || "中国",
        countryEn: "China",
        province,
        categoryL1: catL1,
        categoryL2: String(row.category_l2_name || ""),
        budgetDisplay: formatBudget(Number(row.estimated_value) || 0),
        budgetUsd: Number(row.estimated_value) || 0,
        deadline: formatDeadline(Number(row.deadline_sec) || 0),
        responses: 0,
        boosted: Boolean(row.is_featured),
      };
    });

    return NextResponse.json({ items, total, page, page_size: pageSize });
  } catch (err) {
    console.warn("[api/rfq/list] failed:", (err as Error).message);
    return NextResponse.json({ items: [], total: 0, page, page_size: pageSize });
  }
}
