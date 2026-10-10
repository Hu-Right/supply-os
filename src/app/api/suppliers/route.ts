/**
 * GET  /api/suppliers — 供应商目录列表（公开，支持分页/全量模式）
 *
 * @module app/api/suppliers/route
 * @description GET 返回的 items 已通过 mapSupplierRow 映射为前端 Supplier DTO，
 *              含联系方式脱敏。DB 查询失败时返回空结构（非 500），前端显示空状态而非白屏。
 *              供应商入驻注册已统一迁移至 POST /api/user/enterprise（写 supplier 表）。
 *
 *              行业面消费：分页取数后按本页 id 批量装配标准口径标签（一次 rel 查 +
 *              一次节点查），装配失败只降级为自由文本展示，不能把整个目录变成空列表——
 *              目录可用性不依赖字典补数进度。
 *
 *              「行业」是这一页的划分轴，所以它不占 `field` 而是独立参数：
 *                - `industry_code`：门类 chip，命中该节点子树；
 *                - `industry_q`：行业关键词，服务端先解析成节点集再按子树筛。
 *              两者与产品/公司关键词是 AND 交集。行业词解不到节点就是无结果，
 *              不回落 `supplier.industry` 自由文本——否则同一个词在主轴与词框上会是两套结果。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";
import { mapSupplierRow } from "@/lib/services/suppliers";
import { loadSupplierIndustryInfo } from "@/lib/services/industry-labels";
import type { SupplierIndustryInfo } from "@/lib/services/industry-labels";
import { resolveIndustryKeywordCodes } from "@/lib/services/industry-facets";
import { sanitizeIndustryCode } from "@/lib/services/industry-code";
import type { IndustryNodeRepo } from "@/lib/repos/industry-node.repo";
import type { SupplierDirectoryRow } from "@/lib/repos/suppliers";
import type { Supplier } from "@/types";

/** 批量映射：原始 DB 行 → 前端 Supplier DTO（column→field 转换 + 脱敏 + 行业面标签） */
async function mapSupplierItems(
  rows: SupplierDirectoryRow[],
  industryRepo: IndustryNodeRepo,
): Promise<Supplier[]> {
  const industryById = new Map<number, SupplierIndustryInfo>();
  try {
    for (const [k, v] of await loadSupplierIndustryInfo(industryRepo, rows)) industryById.set(k, v);
  } catch (err) {
    // 字典层故障必须报出来（否则整站默默退回旧文本而无人知道），但不阻断目录
    console.error("[suppliers GET] 行业面标签装配失败，本次退回自填文本:", err);
  }
  return rows.map((row) => mapSupplierRow(row, industryById.get(Number(row.id)) ?? null));
}

export const GET = withRoute(async (req: NextRequest) => {
  const pageParam = req.nextUrl.searchParams.get("page");
  const ctx = getContext();
  const { directoryRepo, industryRepo } = ctx.supplier;

  try {
    if (pageParam && Number(pageParam) >= 1) {
      const page = Number(pageParam);
      const pageSize = Math.min(Math.max(Number(req.nextUrl.searchParams.get("pageSize")) || 9, 1), 50);
      const offset = (page - 1) * pageSize;
      const search = req.nextUrl.searchParams.get("q")?.trim() || undefined;
      // 行业面标准口径筛选：非法码静默丢弃（等同不筛选），不拼进 SQL
      const industryCode = sanitizeIndustryCode(req.nextUrl.searchParams.get("industry_code")) || undefined;
      // 关键词检索字段（product / company）：决定 q 落在哪一列，白名单校验在 repo
      const field = req.nextUrl.searchParams.get("field") || undefined;
      // 排序：只透传键名，表达式由 repo 白名单给出（用户输入永不进 ORDER BY）
      const sort = req.nextUrl.searchParams.get("sort") || undefined;

      // 行业关键词 → 行业节点集（树口径）。字典层故障时给空集而不是抛错，
      // 由 repo 的 1 = 0 收成「无结果」，与 facet 计数保持同一份失败语义。
      const industryQ = req.nextUrl.searchParams.get("industry_q")?.trim() || undefined;
      let industryCodes: string[] | undefined;
      if (industryQ) {
        try {
          industryCodes = await resolveIndustryKeywordCodes(industryRepo, industryQ);
        } catch (err) {
          console.error("[suppliers GET] 行业关键词解析失败，本次按无命中处理:", err);
          industryCodes = [];
        }
      }

      const { items, total } = await directoryRepo.listDirectoryPaginated({
        limit: pageSize, offset, search, field, sort, industryCode, industryCodes,
      });
      const dtoItems = await mapSupplierItems(items, industryRepo);
      return NextResponse.json({ items: dtoItems, total, page, pageSize });
    }

    const rows = await directoryRepo.listDirectory();
    const dtoItems = await mapSupplierItems(rows, industryRepo);
    return NextResponse.json(dtoItems);
  } catch (err) {
    console.error("[suppliers GET]", err);
    if (pageParam && Number(pageParam) >= 1) {
      return NextResponse.json({ items: [], total: 0, page: Number(pageParam) || 1, pageSize: 9 });
    }
    return NextResponse.json([]);
  }
});
