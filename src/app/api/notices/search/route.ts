/**
 * GET /api/notices/unified-search — 统一搜索（default/prefs/recommended 模式）
 * GET /api/notices/countries — 国家列表
 * GET /api/notices/agencies — 机构列表
 * GET /api/notices/stats — 统计数据
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/server/db/pool";
import { extractUserKey } from "@/server/middleware/auth";
import { searchUnified } from "@/server/services/search-orchestrator";
import { getNoticeCountries, getNoticeAgencies, getNoticeStats } from "@/server/services/notice-search";

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
  const url = new URL(req.url);
  const path = url.pathname;
  const pool = getPool();

  if (path.endsWith("/unified-search")) {
    const auth = await extractUserKey(req);
    const params = parseSearchParams(req);
    params.userKey = auth.userKey;
    const result = await searchUnified(pool, params);
    return NextResponse.json(result);
  }

  if (path.endsWith("/countries")) {
    const countries = await getNoticeCountries(pool);
    return NextResponse.json(countries);
  }

  if (path.endsWith("/agencies")) {
    const lang = req.nextUrl.searchParams.get("lang")?.toLowerCase() || "en";
    const agencies = await getNoticeAgencies(pool, lang);
    return NextResponse.json(agencies);
  }

  if (path.endsWith("/stats")) {
    const stats = await getNoticeStats(pool);
    return NextResponse.json(stats);
  }

  return NextResponse.json({ code: 40404, message: "Not found" }, { status: 404 });
}
