/**
 * GET /api/user/industry-prefs — 获取行业偏好（需认证）
 * POST /api/user/industry-prefs — 设置行业偏好（需认证）
 *
 * POST 请求体格式（与 Express 版本一致）：
 *   { level1_id, level2_id, level3_id, level4_id, level5_id }
 *   level1_id 为 null/0 时清除偏好。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";

export async function GET(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;
  const prefs = await getContext().user.userPrefsRepo.getIndustryPrefs(auth.userId!);
  return NextResponse.json({ prefs: prefs || null });
}

export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;
  let body: {
    level1_id?: number | null;
    level2_id?: number | null;
    level3_id?: number | null;
    level4_id?: number | null;
    level5_id?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: 40000, message: "请求数据格式错误" }, { status: 400 });
  }

  const levels = [1, 2, 3, 4, 5].map((n) => {
    const key = `level${n}_id` as keyof typeof body;
    const value = Number(body[key] || 0);
    return Number.isInteger(value) && value > 0 ? value : null;
  });

  if (!levels[0]) {
    // level1_id 为空：清除偏好（与 Express 版本行为一致）
    await getContext().user.userPrefsRepo.deleteIndustryPrefs(auth.userKey);
  } else {
    await getContext().user.userPrefsRepo.upsertIndustryPrefs(auth.userKey, levels);
  }
  return NextResponse.json({ success: true });
}
