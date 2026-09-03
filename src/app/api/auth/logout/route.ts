/**
 * POST /api/auth/logout — 登出（清除 Refresh Token）
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";
import { hashRefreshToken } from "@/lib/services/jwt";
import { readRefreshCookieFromRequest, clearRefreshCookieOnResponse } from "@/lib/utils/auth-cookies-next";

export const POST = withRoute(async (req: Request) => {
  const refreshToken = readRefreshCookieFromRequest(req);
  if (refreshToken) {
    const tokenHash = hashRefreshToken(refreshToken);
    await getContext().user.authRepo.deleteRefreshTokenByHash(tokenHash);
  }
  const response = NextResponse.json({ success: true });
  clearRefreshCookieOnResponse(response);
  return response;
});
