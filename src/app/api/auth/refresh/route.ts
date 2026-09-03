/**
 * POST /api/auth/refresh — Token 刷新（Refresh Token 轮换）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashRefreshToken, getRefreshTokenExpiresAt } from "@/lib/services/jwt";
import { readRefreshCookieFromRequest, setRefreshCookieOnResponse } from "@/lib/utils/auth-cookies-next";

export const POST = withRoute(async (req: NextRequest) => {
  const refreshToken = readRefreshCookieFromRequest(req);
  if (!refreshToken) {
    routeError(400, 40050, "缺少刷新令牌");
  }

  let payload: { user_key: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    routeError(401, 40051, "刷新令牌无效");
  }

  const authRepo = getContext().user.authRepo;
  const tokenHash = hashRefreshToken(refreshToken);
  const stored = await authRepo.findRefreshTokenByHash(tokenHash);
  if (!stored) {
    routeError(401, 40052, "刷新令牌已失效");
  }

  const user = await getContext().user.usersRepo.findProfileByKey(payload.user_key);
  if (!user) {
    routeError(404, 40044, "用户不存在");
  }

  // 账号状态校验（审查 F32）：被禁用/驳回的账号不得续期，并吊销其全部会话
  const status = (user as { account_status?: string }).account_status;
  if (status === "disabled" || status === "rejected") {
    await authRepo.deleteRefreshTokensByUser(user.id!);
    routeError(403, 40003, "账号未通过审核或已停用");
  }

  // Refresh Token 原子轮换（审查 F32）：以条件删除的受影响行数为判定——
  // 并发重放同一 refresh token 时，仅首个请求轮换成功，后续全部拒绝
  const newAccessToken = signAccessToken({ user_key: payload.user_key, email: (user as any).email || "", uid: user.id });
  const { token: newRefreshToken, tokenHash: newTokenHash } = signRefreshToken({ user_key: payload.user_key, uid: user.id });
  const deleted = await authRepo.deleteRefreshTokenByHash(tokenHash);
  if (deleted === 0) {
    routeError(401, 40052, "刷新令牌已失效");
  }
  await authRepo.insertRefreshToken(user.id!, newTokenHash, getRefreshTokenExpiresAt());

  const response = NextResponse.json({ success: true, token: newAccessToken });
  setRefreshCookieOnResponse(response, newRefreshToken);
  return response;
});
