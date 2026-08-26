/**
 * GET /api/suppliers — 供应商列表（公开，支持分页/全量模式）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";

export async function GET(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("lang")?.toLowerCase() || "zh";
  const pageParam = req.nextUrl.searchParams.get("page");
  const ctx = getContext();
  const { directoryRepo } = ctx.supplier;

  if (pageParam && Number(pageParam) >= 1) {
    const page = Number(pageParam);
    const pageSize = Math.min(Math.max(Number(req.nextUrl.searchParams.get("pageSize")) || 9, 1), 50);
    const offset = (page - 1) * pageSize;
    const search = req.nextUrl.searchParams.get("q")?.trim() || undefined;
    const type = req.nextUrl.searchParams.get("type") || undefined;
    const industry = req.nextUrl.searchParams.get("industry") || undefined;

    const { items, total } = await directoryRepo.listDirectoryPaginated({ limit: pageSize, offset, lang, search, type, industry });
    return NextResponse.json({ items, total, page, pageSize });
  }

  // 全量模式
  const rows = await directoryRepo.listDirectory();
  return NextResponse.json(rows);
}
