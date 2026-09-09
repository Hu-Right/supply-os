/**
 * GET  /api/suppliers — 供应商目录列表（公开，支持分页/全量模式）
 * POST /api/suppliers — 供应商入驻注册（需认证）
 *
 * @module app/api/suppliers/route
 * @description GET 返回的 items 已通过 mapSupplierRow 映射为前端 Supplier DTO，
 *              含联系方式脱敏。DB 查询失败时返回空结构（非 500），前端显示空状态而非白屏。
 *              POST 编排已下沉 lib/services/suppliers.ts（A4）。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, parseJson } from "@/lib/middleware/route-handler";
import { mapSupplierRow, registerCrmSupplier } from "@/lib/services/suppliers";
import type { SupplierDirectoryRow } from "@/lib/repos/suppliers";
import type { Supplier } from "@/types";

/** 批量映射：原始 DB 行 → 前端 Supplier DTO（column→field 转换 + 脱敏） */
function mapSupplierItems(rows: SupplierDirectoryRow[]): Supplier[] {
  return rows.map((row) => mapSupplierRow(row));
}

export async function GET(req: NextRequest) {
  const pageParam = req.nextUrl.searchParams.get("page");
  const ctx = getContext();
  const { directoryRepo } = ctx.supplier;

  try {
    if (pageParam && Number(pageParam) >= 1) {
      const page = Number(pageParam);
      const pageSize = Math.min(Math.max(Number(req.nextUrl.searchParams.get("pageSize")) || 9, 1), 50);
      const offset = (page - 1) * pageSize;
      const search = req.nextUrl.searchParams.get("q")?.trim() || undefined;
      const type = req.nextUrl.searchParams.get("type") || undefined;
      const industry = req.nextUrl.searchParams.get("industry") || undefined;

      const { items, total } = await directoryRepo.listDirectoryPaginated({ limit: pageSize, offset, search, type, industry });
      const dtoItems = mapSupplierItems(items);
      return NextResponse.json({ items: dtoItems, total, page, pageSize });
    }

    const rows = await directoryRepo.listDirectory();
    const dtoItems = mapSupplierItems(rows);
    return NextResponse.json(dtoItems);
  } catch (err) {
    console.error("[suppliers GET]", err);
    if (pageParam && Number(pageParam) >= 1) {
      return NextResponse.json({ items: [], total: 0, page: Number(pageParam) || 1, pageSize: 9 });
    }
    return NextResponse.json([]);
  }
}

const registerSchema = z.object({
  nameZh: z.string().optional(),
  contactPerson: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().optional(),
  mainProductsZh: z.array(z.string()).optional(),
  industryZh: z.string().optional(),
  complianceLabelsZh: z.array(z.string()).optional(),
});

export const POST = withRoute(async (req: NextRequest) => {
  await requireUserKeyOrThrow(req);
  const body = await parseJson(req, registerSchema);

  const supplier = await registerCrmSupplier(getContext().supplier.registrationRepo, body);
  return NextResponse.json(supplier, { status: 201 });
});
