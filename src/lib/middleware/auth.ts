/**
 * Next.js Route Handler 认证 helper
 *
 * 从 JWT Access Token 提取 userKey，供 Route Handler 使用。
 * 对应 Express 的 server/middleware/auth.ts。
 */
import { NextRequest } from "next/server";

export interface AuthResult {
  userKey: string;
  authViaJwt: boolean;
}

/** 从 Authorization 头部提取并验证 JWT，返回 userKey */
export async function extractUserKey(req: NextRequest): Promise<AuthResult> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { userKey: "", authViaJwt: false };

  try {
    const { verifyAccessToken } = await import("@/lib/services/jwt");
    const { normalizeUserKey } = await import("@/lib/utils/normalize");
    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);
    const userKey = normalizeUserKey(payload.user_key) || "";
    return { userKey, authViaJwt: !!userKey };
  } catch {
    return { userKey: "", authViaJwt: false };
  }
}

/** 要求认证：未登录返回 401 响应 */
export async function requireUserKey(req: NextRequest): Promise<AuthResult | Response> {
  const result = await extractUserKey(req);
  if (!result.userKey) {
    return Response.json(
      { code: 40042, message: "请先登录", error: "请先登录" },
      { status: 401 },
    );
  }
  return result;
}
