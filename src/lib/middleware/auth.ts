/**
 * Next.js Route Handler 认证 helper
 *
 * 从 JWT Access Token 提取 userKey + userId，供 Route Handler 使用。
 * user_id 迁移 Phase 2：JWT 新增 uid claim；旧 token 无 uid 时回退查 crm_users。
 */
import { NextRequest } from "next/server";

export interface AuthResult {
  userKey: string;
  /** 内部用户 ID（来自 JWT uid claim 或 DB 回退查询） */
  userId: number | null;
  authViaJwt: boolean;
}

/** 从 Authorization 头部提取并验证 JWT，返回 userKey + userId */
export async function extractUserKey(req: NextRequest): Promise<AuthResult> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { userKey: "", userId: null, authViaJwt: false };

  try {
    const { verifyAccessToken } = await import("@/lib/services/jwt");
    const { normalizeUserKey } = await import("@/lib/utils/normalize");
    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);
    const userKey = normalizeUserKey(payload.user_key) || "";
    if (!userKey) return { userKey: "", userId: null, authViaJwt: false };

    // 优先使用 JWT 中的 uid claim；旧 token 无 uid 时回退查 DB
    let userId: number | null = payload.uid ?? null;
    if (!userId) {
      try {
        const { getContext } = await import("@/lib/db/context");
        const ctx = getContext();
        const user = await ctx.user.usersRepo.findByKey(userKey);
        userId = user?.id ?? null;
      } catch {
        // DB 查询失败不阻断认证，userId 保持 null
      }
    }
    return { userKey, userId, authViaJwt: true };
  } catch {
    return { userKey: "", userId: null, authViaJwt: false };
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
