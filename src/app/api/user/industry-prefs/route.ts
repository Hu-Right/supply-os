/**
 * GET /api/user/industry-prefs — 获取行业偏好（需认证）
 * POST /api/user/industry-prefs — 设置行业偏好（需认证）
 *
 * POST 请求体格式（码版）：
 *   { commodity_code: "UGT-…" }   — 最深已选 UGT 骨架节点码（L1 大类行或 L2~L5 节点）
 *   { commodity_code: null }      — 清除偏好
 * 大类码（group_code，可见性判定的唯一输入）由服务端从节点码换算后同批写入；
 * 旧行的 levelN_id（UNSPSC 字典行 id）随字典退役恒置 NULL。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { invalidateProfileCache } from "@/lib/services/industry-profile/resolve";
import { normalizeBackboneNodeKey } from "@/lib/services/commodity/backbone-path";
import { isCommodityGroupCode } from "@/lib/services/commodity/groups";
import { isCommodityNodeKey, resolveGroupCodeOfNode } from "@/lib/services/commodity/tree";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const prefs = await getContext().user.userPrefsRepo.getIndustryPrefs(auth.userId);
  return NextResponse.json({ prefs: prefs || null });
});

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  let body: { commodity_code?: string | null };
  try {
    body = await req.json();
  } catch {
    routeError(400, EC_INVALID_PARAMS, "请求数据格式错误");
  }

  const raw = String(body.commodity_code ?? "").trim();
  const ctx = getContext();

  if (!raw) {
    // 空码：清除偏好（与旧行为一致）
    await ctx.user.userPrefsRepo.deleteIndustryPrefs(auth.userId);
    invalidateProfileCache(auth.userId);
    return NextResponse.json({ success: true });
  }

  const code = normalizeBackboneNodeKey(raw);
  if (!isCommodityNodeKey(code) && !isCommodityGroupCode(code)) {
    routeError(400, EC_INVALID_PARAMS, "品目分类码非法（需为 UGT 大类码或骨架节点码）");
  }

  // 大类码是可见性判定的唯一输入，必须与节点码同批写；换不出写 NULL 并告警（不猜一个大类）
  const groupCode = isCommodityGroupCode(code) ? code : await resolveGroupCodeOfNode(ctx.dbPool, code);
  if (!groupCode) {
    console.warn(`[industry-prefs] user=${auth.userId} 的偏好码 ${code} 换不出品目大类码，group_code 落 NULL`);
  }
  await ctx.user.userPrefsRepo.upsertIndustryPrefs(auth.userId, code, groupCode);
  invalidateProfileCache(auth.userId);
  return NextResponse.json({ success: true });
});
