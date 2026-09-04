/**
 * POST /api/auth/refresh — Token 刷新（非严格轮换，多标签页安全）
 *
 * 旧 Refresh Token 不立即删除，保留至自然过期（7d）或由定期清理回收。
 * 原因：严格轮换（删除旧 token → 插入新 token）在多标签页场景下会导致
 * Tab A 轮换成功后 Tab B 用同一旧 token 刷新失败（deleted===0 → 401），
 * 进而误清全局认证状态。非严格轮换下旧 token 始终可验证，彻底消除该竞态。
 *
 * crm_users.user_key 列退役收尾：payload 中已彻底移除 user_key 字段，
 * 旧 token（无 uid 仅 user_key）不再兼容——直接返回 401，用户重新登录即可。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashRefreshToken, getRefreshTokenExpiresAt } from "@/lib/services/jwt";
import { readRefreshCookieFromRequest, setRefreshCookieOnResponse } from "@/lib/utils/auth-cookies-next";

export const POST = withRoute(async (req: NextRequest) => {
  // 双通道读取：优先 HttpOnly Cookie，降级从请求体读取（localStorage 兜底）
  let refreshToken = readRefreshCookieFromRequest(req);
  if (!refreshToken) {
    try {
      const body = await req.json();
      refreshToken = String(body?.refresh_token || "").trim();
    } catch { /* body 非 JSON，忽略 */ }
  }
  if (!refreshToken) {
    routeError(400, 40050, "缺少刷新令牌");
  }

  // 新 token 必须以 uid 为身份锚点；旧 token 无 uid → 直接拒绝（要求用户重新登录）
  let payload: { uid?: number };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    routeError(401, 40051, "刷新令牌无效");
  }
  if (!payload.uid) {
    routeError(401, 40051, "刷新令牌已过期，请重新登录");
  }

  const authRepo = getContext().user.authRepo;

  // 非严格轮换：只查询不删除。旧 token 保留至自然过期，避免多标签页互踢。
  const stored = await authRepo.findRefreshTokenByHash(hashRefreshToken(refreshToken));
  if (!stored) {
    routeError(401, 40052, "刷新令牌已失效");
  }

  const usersRepo = getContext().user.usersRepo;
  const user = await usersRepo.findProfileById(payload.uid);
  if (!user) {
    routeError(404, 40044, "用户不存在");
  }

  // 账号状态校验（审查 F32）：被禁用/驳回的账号不得续期，并吊销其全部会话
  const status = (user as { account_status?: string }).account_status;
  if (status === "disabled" || status === "rejected") {
    await authRepo.deleteRefreshTokensByUser(user.id!);
    routeError(403, 40003, "账号未通过审核或已停用");
  }

  // 签发新 Token 对：新 refresh token 入库，旧 token 保留至自然过期
  const newAccessToken = signAccessToken({ uid: user.id! });
  const { token: newRefreshToken, tokenHash: newTokenHash } = signRefreshToken({ uid: user.id! });
  await authRepo.insertRefreshToken(user.id!, newTokenHash, getRefreshTokenExpiresAt());

  const response = NextResponse.json({
    success: true,
    token: newAccessToken,
    refresh_token: newRefreshToken,
  });
  setRefreshCookieOnResponse(response, newRefreshToken);
  return response;
});
