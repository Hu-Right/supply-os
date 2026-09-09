/**
 * GET /api/suppliers/[id] — 单条供应商详情（公开）
 *
 * @module app/api/suppliers/[id]/route
 * @description 按 ID 查询单条供应商，返回 Supplier DTO。
 *              含多语言译文（crm_supplier_translations）与联系方式脱敏。
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
    const lang = req.nextUrl.searchParams.get("lang")?.toLowerCase() || "zh";

    // ID 格式：前端为 "sup-db-{numeric}" 或纯数字，提取数字部分
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

    // 取译文（best-effort，失败静默降级）
    let tr: any = null;
    try {
      const translations = await ctx.supplier.registrationRepo.listTranslations(lang, [row.id]);
      tr = translations[0] ?? null;
    } catch {
      // 译文不可用时，mapSupplierRow 会用中文原文兜底
    }

    const dto = mapSupplierRow(row, tr);
    return NextResponse.json(dto);
  } catch (err) {
    console.error("[suppliers/:id GET]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal error", detail: msg }, { status: 500 });
  }
}
