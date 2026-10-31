/**
 * GET /api/rfq/list — RFQ 需求广场列表
 *
 * @module app/api/rfq/list/route
 * @description 从 bid_notices 查询 entry_source='platform' AND notice_type='RFQ' AND rfq_status='published' 的记录。
 *              筛选：关键词 + 品目大类（UGT L1 树码前缀）；交付地点为手动填写地址，仅展示不筛选。
 *              替代旧版前端 PLAZA_RFQS 静态数组。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import { withRoute } from "@/lib/middleware/route-handler";
import { formatDeadlineDateYMD, currencySymbol } from "@/shared/utils/format";
import { commodityNodeLevel, isCommodityNodeKey } from "@/lib/services/commodity/tree";

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

  const ctx = getContext();

  // 品目大类筛选：非法码直接当空结果处理（不 500：筛选参数可手输）；
  // 合法的 L1 树码再交由 repo 层走 category_code 前缀谓词
  if (categoryL1 && (!isCommodityNodeKey(categoryL1) || commodityNodeLevel(categoryL1) !== 1)) {
    return NextResponse.json({ items: [], total: 0, page, page_size: pageSize });
  }

  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`RFQ list timeout ${MYSQL_TIMEOUT_MS}ms`)), MYSQL_TIMEOUT_MS));

    const { total, rows } = await Promise.race([
      ctx.rfqRepo.listRfqs({ q, categoryL1, sort, page, pageSize }),
      timeout,
    ]);

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
