/**
 * GET /api/rfq/list — RFQ 需求广场列表
 *
 * @module app/api/rfq/list/route
 * @description 从 bid_notices 查询 entry_source='platform' AND notice_type='RFQ' AND rfq_status='published' 的记录。
 *              筛选：关键词 + 品目大类（UGT L1 树码前缀）；交付地点为手动填写地址，仅展示不筛选。
 *              替代旧版前端 PLAZA_RFQS 静态数组。
 */
import { RFQ_STATUS } from "@/shared/constants/rfq";
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import { withRoute } from "@/lib/middleware/route-handler";
import { formatDeadlineDateYMD, currencySymbol } from "@/shared/utils/format";
import { commodityNodeLevel, isCommodityNodeKey } from "@/lib/services/commodity/tree";
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
  // 品目大类筛选：L1 树码 UGT-xx（2026-10-15 G 码退役；旧字典行 id 参数随旧品类字典退役停用）
  const categoryL1 = String(sp.get("category_l1") || "").trim().slice(0, 16);
  const sort = sp.get("sort") === "deadline" ? "deadline" : sp.get("sort") === "budget" ? "budget" : "newest";

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
  if (categoryL1) {
    // 非法码直接当空条件处理（不 500：筛选参数可手输）
    if (!isCommodityNodeKey(categoryL1) || commodityNodeLevel(categoryL1) !== 1) {
      return NextResponse.json({ items: [], total: 0, page, page_size: pageSize });
    }
    // 大类筛选走码前缀谓词，不再依赖 JOIN：category_code 存的就是 UGT 节点码，
    // 其 L1 前缀命中 = 该大类下任何深度（与宽表 backbone_path 链顶同口径）
    conditions.push("n.category_code LIKE ?");
    params.push(`${categoryL1}%`);
  }

  const whereSql = conditions.join(" AND ");
  const orderBy = sort === "deadline" ? "n.deadline_sec ASC" : sort === "budget" ? "n.estimated_value DESC" : "n.id DESC";
  const offset = (page - 1) * pageSize;

  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`RFQ list timeout ${MYSQL_TIMEOUT_MS}ms`)), MYSQL_TIMEOUT_MS));

    const [countResult, dataResult] = await Promise.all([
      Promise.race([pool.query(
        // 计数不再 JOIN：大类筛选走 category_code 前缀，条件全部落在主表
        `SELECT COUNT(*) AS total FROM bid_notices n
         WHERE ${whereSql}`, params), timeout]),
      Promise.race([
        pool.query(
          `SELECT n.id, n.reference, n.title, n.country, n.province_name, n.delivery_address,
                  n.category_code, c1.name_zh AS category_name,
                  c0.name_zh AS category_l1_name,
                  n.estimated_value, n.currency, n.deadline_sec, n.is_featured, n.agency,
                  (SELECT COUNT(*) FROM rfq_quotes q WHERE q.rfq_id = n.id AND q.status <> 'withdrawn') AS quote_count
           FROM bid_notices n
           LEFT JOIN commodity_backbone c1 ON c1.code = n.category_code
           LEFT JOIN commodity_backbone c0 ON c0.code = LEFT(n.category_code, 6) AND c0.level = 1
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
      // 交付地点：手动填写地址优先；province_name 仅历史行残留（不再写、不再筛选）
      const address = String(row.delivery_address || "");
      const legacyProvince = String(row.province_name || "");
      const location = address || legacyProvince;
      // 一级名 = 所在大类（L1）的树名，二级名 = 存储节点自身名称；无码的老行两列皆空
      const catL1 = String(row.category_l1_name || "");
      const catL2 = String(row.category_name || "");
      return {
        id: Number(row.id),
        reference: String(row.reference || ""),
        industry: catL1 || catL2,
        tag: catL1 || catL2,
        title: String(row.title || ""),
        countryZh: "中国",
        countryEn: "China",
        address: location,
        province: legacyProvince || undefined,
        categoryL1: catL1,
        categoryL2: catL2,
        budgetDisplay: formatBudget(Number(row.estimated_value) || 0, String(row.currency || "CNY")),
        budgetUsd: Number(row.estimated_value) || 0,
        currency: String(row.currency || "CNY"),
        deadline: formatDeadlineDateYMD(Number(row.deadline_sec) || 0, { utc: true, emptyText: "" }),
        responses: Number(row.quote_count) || 0,
        boosted: Boolean(row.is_featured),
      };
    });

    return NextResponse.json({ items, total, page, page_size: pageSize });
  } catch (err) {
    console.warn("[api/rfq/list] failed:", (err as Error).message);
    return NextResponse.json({ items: [], total: 0, page, page_size: pageSize });
  }
});
