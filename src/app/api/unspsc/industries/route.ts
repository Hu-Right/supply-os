/**
 * GET /api/unspsc/industries — UNSPSC 一级行业分类（10min 缓存）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/server/db/context";

export async function GET(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("lang")?.toLowerCase() || "";
  const catalogRepo = getContext().catalogRepo;

  const whereAndOrder = "u.level = 1 ORDER BY u.id";
  let rows: unknown[];

  if (lang && ["fr", "ru", "es", "ar"].includes(lang)) {
    rows = await catalogRepo.listUnspscWithTranslation(
      `SELECT u.id, u.title_zh, u.title, u.code, u.parent_id, u.level, tr.title_tr AS title_i18n
       FROM crm_unspsc_codes u
       LEFT JOIN crm_unspsc_translations tr ON tr.code_id = u.id AND tr.lang = ?
       WHERE ${whereAndOrder}`,
      [lang],
    );
  } else {
    rows = await catalogRepo.listUnspscWithTranslation(
      `SELECT u.id, u.title_zh, u.title, u.code, u.parent_id, u.level FROM crm_unspsc_codes u WHERE ${whereAndOrder}`,
      [],
    );
  }

  return NextResponse.json(rows, { headers: { "Cache-Control": "public, max-age=600" } });
}
