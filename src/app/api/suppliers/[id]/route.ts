/**
 * GET /api/suppliers/[id] — 单条供应商详情（公开）
 *
 * @module app/api/suppliers/[id]/route
 * @description 按 ID 查询单条供应商，返回 Supplier DTO（含联系方式脱敏）。
 *              找不到返回 404，参数无效返回 400。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { mapSupplierRow } from "@/lib/services/suppliers";

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
    const row = await ctx.supplier.directoryRepo.findById(numericId);

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
