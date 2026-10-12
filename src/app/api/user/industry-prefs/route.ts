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
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { groupCodeOfLevelIds } from "@/lib/services/commodity/tree";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const prefs = await getContext().user.userPrefsRepo.getIndustryPrefs(auth.userId);
  return NextResponse.json({ prefs: prefs || null });
});

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
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
    routeError(400, EC_INVALID_PARAMS, "请求数据格式错误");
  }

  const levels = [1, 2, 3, 4, 5].map((n) => {
    const key = `level${n}_id` as keyof typeof body;
    const value = Number(body[key] || 0);
    return Number.isInteger(value) && value > 0 ? value : null;
  });

  const ctx = getContext();
  if (!levels[0]) {
    // level1_id 为空：清除偏好（与 Express 版本行为一致）
    await ctx.user.userPrefsRepo.deleteIndustryPrefs(auth.userId);
  } else {
    // 大类码是可见性判定的唯一输入，必须跟五级 id 同批写：历史上没人写这一列，
    // 现存的 11 行全是迁移脚本一次性灌的 ⇒ 不补就等于「新注册用户没有行业」。
    // 换不出就写 NULL 并告警（不拿旧值兜底、不猜一个大类），由门禁点名。
    const groupCode = await groupCodeOfLevelIds(ctx.dbPool, levels);
    if (!groupCode) {
      console.warn(`[industry-prefs] user=${auth.userId} 的五级偏好换不出品目大类码，group_code 落 NULL`);
    }
    await ctx.user.userPrefsRepo.upsertIndustryPrefs(auth.userId, levels, groupCode);
  }
  return NextResponse.json({ success: true });
});
