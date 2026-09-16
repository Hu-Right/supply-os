/**
 * GET /api/unspsc/children — UNSPSC 子分类（按 parent_id）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";

export const GET = withRoute(async (req: NextRequest) => {
  const parentId = Number(req.nextUrl.searchParams.get("parent_id") || 0);
  if (!parentId) {
    routeError(400, EC_INVALID_PARAMS, "请提供分类 ID");
  }
  const lang = req.nextUrl.searchParams.get("lang")?.toLowerCase() || "";
  const catalogRepo = getContext().catalogRepo;

  let rows: unknown[];
  if (lang && ["fr", "ru", "es", "ar"].includes(lang)) {
    rows = await catalogRepo.listUnspscWithTranslation(
      `SELECT u.id, u.title_zh, u.title, u.code, u.parent_id, u.level, tr.title_tr AS title_i18n
       FROM crm_unspsc_codes u
       LEFT JOIN crm_unspsc_translations tr ON tr.code_id = u.id AND tr.lang = ?
       WHERE u.parent_id = ? ORDER BY u.code`,
      [lang, parentId],
    );
  } else {
    rows = await catalogRepo.listUnspscWithTranslation(
      `SELECT u.id, u.title_zh, u.title, u.code, u.parent_id, u.level FROM crm_unspsc_codes u WHERE u.parent_id = ? ORDER BY u.code`,
      [parentId],
    );
  }

  return NextResponse.json(rows);
});
