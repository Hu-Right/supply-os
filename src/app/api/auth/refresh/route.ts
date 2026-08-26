/**
 * POST /api/auth/refresh — Token 刷新（Refresh Token 轮换）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashRefreshToken, getRefreshTokenExpiresAt } from "@/lib/services/jwt";
import { readRefreshCookieFromRequest, setRefreshCookieOnResponse } from "@/lib/utils/auth-cookies-next";

export async function POST(req: NextRequest) {
  const refreshToken = readRefreshCookieFromRequest(req);
  if (!refreshToken) {
    return NextResponse.json({ code: 40050, message: "缺少刷新令牌" }, { status: 400 });
  }

  let payload: { user_key: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    return NextResponse.json({ code: 40051, message: "刷新令牌无效" }, { status: 401 });
  }

  const authRepo = getContext().user.authRepo;
  const tokenHash = hashRefreshToken(refreshToken);
  const stored = await authRepo.findRefreshTokenByHash(tokenHash);
  if (!stored) {
    return NextResponse.json({ code: 40052, message: "刷新令牌已失效" }, { status: 401 });
  }

  const user = await getContext().user.usersRepo.findProfileByKey(payload.user_key);
  if (!user) {
    return NextResponse.json({ code: 40044, message: "用户不存在" }, { status: 404 });
  }

  // Refresh Token 轮换
  const newAccessToken = signAccessToken({ user_key: payload.user_key, email: (user as any).email || "" });
  const { token: newRefreshToken, tokenHash: newTokenHash } = signRefreshToken({ user_key: payload.user_key });
  await authRepo.deleteRefreshTokenByHash(tokenHash);
  await authRepo.insertRefreshToken(payload.user_key, newTokenHash, getRefreshTokenExpiresAt());

  const response = NextResponse.json({ success: true, token: newAccessToken });
  setRefreshCookieOnResponse(response, newRefreshToken);
  return response;
}
