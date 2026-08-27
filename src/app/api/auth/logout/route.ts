/**
 * POST /api/auth/logout — 登出（清除 Refresh Token）
 */
import { NextResponse } from "next/server";
import { getContext } from "@/server/db/context";
import { hashRefreshToken } from "@/server/services/jwt";
import { readRefreshCookieFromRequest, clearRefreshCookieOnResponse } from "@/server/utils/auth-cookies-next";

export async function POST(req: Request) {
  const refreshToken = readRefreshCookieFromRequest(req);
  if (refreshToken) {
    const tokenHash = hashRefreshToken(refreshToken);
    await getContext().user.authRepo.deleteRefreshTokenByHash(tokenHash);
  }
  const response = NextResponse.json({ success: true });
  clearRefreshCookieOnResponse(response);
  return response;
}
