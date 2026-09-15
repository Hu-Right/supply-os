/**
 * GET /api/suppliers/[id] — 单条供应商详情（公开）
 *
 * @module app/api/suppliers/[id]/route
 * @description 按 ID 查询单条供应商，返回 Supplier DTO（含联系方式脱敏）。
 *              找不到返回 404，参数无效返回 400。
 *              防重兜底：当查到的记录关键字段（products/industry）为空时，
 *              自动按公司名查找数据更完整的同公司记录（应对外部同步产生空字段重复记录）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { mapSupplierRow } from "@/lib/services/suppliers";

/** 判断记录是否缺少关键字段（外部同步可能产生空字段重复记录） */
function isSparseRecord(row: { products?: string | null; industry?: string | null }): boolean {
  const products = String(row.products ?? "").trim();
  const industry = String(row.industry ?? "").trim();
  return products === "" && industry === "";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const rawId = id.replace(/^sup-db-/, "");
    const numericId = Number(rawId);

    if (!Number.isFinite(numericId) || numericId < 1) {
      return NextResponse.json({ error: "Invalid ID", id }, { status: 400 });
    }

    const ctx = getContext();
    let row = await ctx.supplier.directoryRepo.findById(numericId);

    // 防重兜底：当前记录关键字段全空时，按公司名查找数据更完整的同公司记录
    if (row && isSparseRecord(row)) {
      const companyName = String(row.company ?? "").trim();
      if (companyName) {
        const betterRow = await ctx.supplier.directoryRepo.findByCompanyBest(companyName);
        if (betterRow && betterRow.id !== row.id) {
          console.warn(
            `[suppliers/:id] id=${numericId} 记录字段为空，回退到同公司 id=${betterRow.id}（${companyName}）`,
          );
          row = betterRow;
        }
      }
    }

    if (!row) {
      return NextResponse.json({ error: "Not found", id: numericId }, { status: 404 });
    }

    return NextResponse.json(mapSupplierRow(row));
  } catch (err) {
    console.error("[suppliers/:id GET]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal error", detail: msg }, { status: 500 });
  }
}
