/**
 * GET /api/notices/unified-search — 统一搜索（default/prefs/recommended 模式）
 *
 * @module app/api/notices/unified-search/route
 */
import { NextRequest, NextResponse } from "next/server";
import { extractUserKey } from "@/lib/middleware/auth";
import { searchUnified } from "@/lib/services/search-orchestrator";
import type { RawSearchParams } from "@/lib/services/search-orchestrator/params";
import { getPool } from "@/lib/db/pool";

function parseSearchParams(req: NextRequest): RawSearchParams {
  const sp = req.nextUrl.searchParams;
  const get = (k: string, d = "") => sp.get(k) || d;
  const getInt = (k: string, d = 0) => { const v = sp.get(k); return v ? Number(v) : d; };
  // 属性名使用 camelCase，与 RawSearchParams 接口及 validateParams 内部字段对齐
  return {
    mode: get("mode", "default"),
    userId: 0,
    page: getInt("page", 1),
    pageSize: getInt("page_size", 10),
    locale: get("locale"),
    q: get("q"),
    country: get("country"),
    agency: get("agency"),
    deadlineFrom: get("deadline_from"),
    deadlineTo: get("deadline_to"),
    deadlineWithinDays: getInt("deadline_within_days"),
    noticeType: get("notice_type"),
    featuredOnly: sp.get("featured") === "1",
    sort: get("sort", "deadline_farthest"),
    codeId: getInt("code_id") || getInt("industry_id"),
  };
}

export async function GET(req: NextRequest) {
  const auth = await extractUserKey(req);
  const params = parseSearchParams(req);
  // 身份参数仅传 userId（crm_users.user_key 列退役收尾）
  params.userId = auth.userId || undefined;
  const pool = getPool();
  const result = await searchUnified(pool, params);
  return NextResponse.json({ ...result, page_size: result.pageSize });
}
