/**
 * GET /api/suppliers/[id] — 单条供应商详情（公开）
 *
 * @module app/api/suppliers/[id]/route
 * @description 按 ID 查询单条供应商，返回 Supplier DTO。
 *              含多语言译文（crm_supplier_translations）与联系方式脱敏。
 *              找不到返回 404。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { mapSupplierRow } from "@/lib/services/suppliers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const lang = _req.nextUrl.searchParams.get("lang")?.toLowerCase() || "zh";
  // ID 格式：前端为 "sup-db-{numeric}" 或纯数字，提取数字部分
  const numericId = Number(id.replace(/^sup-db-/, ""));

  if (!Number.isFinite(numericId) || numericId < 1) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const ctx = getContext();
  const { directoryRepo, registrationRepo } = ctx.supplier;

  try {
    const row = await directoryRepo.findById(numericId);
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // 取译文
    let translations: any[] = [];
    try {
      translations = await registrationRepo.listTranslations(lang, [row.id]);
    } catch { /* 静默降级 */ }
    const tr = translations[0] ?? null;

    const dto = mapSupplierRow(row, tr);
    return NextResponse.json(dto);
  } catch (err) {
    console.error("[suppliers/:id GET]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
