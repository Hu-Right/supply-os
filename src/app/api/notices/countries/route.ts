/**
 * GET /api/notices/countries — 国家列表（带公告计数）
 *
 * @module app/api/notices/countries/route
 */
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getNoticeCountries } from "@/lib/services/notice-search";

export async function GET() {
  const pool = getPool();
  const countries = await getNoticeCountries(pool);
  return NextResponse.json(countries);
}
