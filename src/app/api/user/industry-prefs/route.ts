/**
 * GET /api/user/industry-prefs — 获取行业偏好（需认证）
 * POST /api/user/industry-prefs — 设置行业偏好（需认证）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/server/db/context";
import { requireUserKey } from "@/server/middleware/auth";

export async function GET(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;
  const prefs = await getContext().user.userPrefsRepo.getIndustryPrefs(auth.userKey);
  return NextResponse.json(prefs || { prefs: null });
}

export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;
  let body: { levels?: (number | null)[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: 40000, message: "Invalid JSON" }, { status: 400 });
  }
  if (body.levels) {
    await getContext().user.userPrefsRepo.upsertIndustryPrefs(auth.userKey, body.levels);
  }
  return NextResponse.json({ success: true });
}
