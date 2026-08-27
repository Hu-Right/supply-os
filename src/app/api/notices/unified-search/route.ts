/**
 * GET /api/notices/unified-search — 统一搜索（default/prefs/recommended 模式）
 *
 * @module app/api/notices/unified-search/route
 */
import { NextRequest, NextResponse } from "next/server";
import { extractUserKey } from "@/lib/middleware/auth";
import { searchUnified } from "@/lib/services/search-orchestrator";
import { getPool } from "@/lib/db/pool";

function parseSearchParams(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const get = (k: string, d = "") => sp.get(k) || d;
  const getInt = (k: string, d = 0) => { const v = sp.get(k); return v ? Number(v) : d; };
  return {
    mode: get("mode", "default"),
    userKey: "",
    page: getInt("page", 1),
    page_size: getInt("page_size", 9),
    locale: get("locale"),
    q: get("q"),
    country: get("country"),
    agency: get("agency"),
    deadline_from: get("deadline_from"),
    deadline_to: get("deadline_to"),
    deadline_within_days: getInt("deadline_within_days"),
    notice_type: get("notice_type"),
    featuredOnly: sp.get("featured") === "1",
    sort: get("sort", "deadline_farthest"),
    codeId: getInt("code_id") || getInt("industry_id"),
  };
}

export async function GET(req: NextRequest) {
  const auth = await extractUserKey(req);
  const params = parseSearchParams(req);
  params.userKey = auth.userKey;
  const pool = getPool();
  const result = await searchUnified(pool, params);
  return NextResponse.json(result);
}
