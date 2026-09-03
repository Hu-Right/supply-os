/**
 * GET  /api/suppliers — 供应商目录列表（公开，支持分页/全量模式）
 * POST /api/suppliers — 供应商入驻注册（需认证）
 *
 * @module app/api/suppliers/route
 * @description GET 返回的 items 已通过 mapSupplierRow 映射为前端 Supplier DTO，
 *              含多语言译文（crm_supplier_translations）与联系方式脱敏。
 *              DB 查询失败时返回空结构（非 500），前端显示空状态而非白屏。
 *              POST 编排已下沉 lib/services/suppliers.ts（A4）。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, parseJson } from "@/lib/middleware/route-handler";
import { mapSupplierRow, registerCrmSupplier } from "@/lib/services/suppliers";
import type { SupplierDirectoryRow, SupplierTranslationRow, SupplierRegistrationRepo } from "@/lib/repos/suppliers";
import type { Supplier } from "@/types";

/**
 * 批量映射：原始 DB 行 → 前端 Supplier DTO。
 * 先按当前语言批量取译文（best-effort，失败静默降级到中文兜底），
 * 再逐行调用 mapSupplierRow 完成 column→field 转换与脱敏。
 */
async function mapSupplierItems(
  rows: SupplierDirectoryRow[],
  lang: string,
  registrationRepo: SupplierRegistrationRepo,
): Promise<Supplier[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  let translations: SupplierTranslationRow[] = [];
  try {
    translations = await registrationRepo.listTranslations(lang, ids);
  } catch {
    // 译文查询失败时静默降级：mapSupplierRow 的 fallback 会用中文原文填充 *En 槽
  }
  const trMap = new Map<number, SupplierTranslationRow | null>();
  for (const tr of translations) trMap.set(tr.supplier_id, tr);

  return rows.map((row) => mapSupplierRow(row, trMap.get(row.id) ?? null));
}

export async function GET(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("lang")?.toLowerCase() || "zh";
  const pageParam = req.nextUrl.searchParams.get("page");
  const ctx = getContext();
  const { directoryRepo, registrationRepo } = ctx.supplier;

  try {
    if (pageParam && Number(pageParam) >= 1) {
      const page = Number(pageParam);
      const pageSize = Math.min(Math.max(Number(req.nextUrl.searchParams.get("pageSize")) || 9, 1), 50);
      const offset = (page - 1) * pageSize;
      const search = req.nextUrl.searchParams.get("q")?.trim() || undefined;
      const type = req.nextUrl.searchParams.get("type") || undefined;
      const industry = req.nextUrl.searchParams.get("industry") || undefined;

      const { items, total } = await directoryRepo.listDirectoryPaginated({ limit: pageSize, offset, lang, search, type, industry });
      const dtoItems = await mapSupplierItems(items, lang, registrationRepo);
      return NextResponse.json({ items: dtoItems, total, page, pageSize });
    }

    const rows = await directoryRepo.listDirectory();
    const dtoItems = await mapSupplierItems(rows, lang, registrationRepo);
    return NextResponse.json(dtoItems);
  } catch (err) {
    console.error("[suppliers GET]", err);
    // 兜底：DB 查询失败时返回空结构而非 500，前端显示空状态而非白屏崩溃
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
