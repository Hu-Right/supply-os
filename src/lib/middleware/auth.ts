/**
 * Next.js Route Handler 认证 helper
 *
 * 从 JWT Access Token 提取 userId，供 Route Handler 使用。
 * userId 为唯一身份标识（user_key 列已废弃）。
 */
import type { NextRequest } from "next/server";
import type { UserId } from "@/lib/types/identity";
import { RouteError } from "./route-handler";
import { EC_AUTH_REQUIRED } from "@/shared/constants/api";

export interface AuthResult {
  /** 内部用户 ID — 全系统唯一身份标识 */
  userId: UserId;
  /**
   * @deprecated 仅限 auth 域路由（bind-email 等 DB 查找）过渡使用。
   * 业务路由、限流、归属校验一律使用 userId。
   * user_key 列退役后此字段将移除。
   */
  userKey: string;
  authViaJwt: boolean;
}

/** 从 Authorization 头部提取并验证 JWT，返回 userId + userKey */
export async function extractUserKey(req: NextRequest): Promise<AuthResult> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { userId: 0, userKey: "", authViaJwt: false };

  try {
    const { verifyAccessToken } = await import("@/lib/services/jwt");
    const { normalizeUserKey } = await import("@/lib/utils/normalize");
    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);
    const userKey = normalizeUserKey(payload.user_key) || "";
    if (!userKey) return { userId: 0, userKey: "", authViaJwt: false };

    // uid claim 自 user_id 迁移（2026-09-04）起始终存在；旧 token 已全部过期
    const userId: UserId = payload.uid ?? 0;
    if (!userId) return { userId: 0, userKey, authViaJwt: true };

    return { userId, userKey, authViaJwt: true };
  } catch {
    return { userId: 0, userKey: "", authViaJwt: false };
  }
}

/** 要求认证：未登录返回 401 响应（withRoute 之外的存量路由使用） */
export async function requireUserKey(req: NextRequest): Promise<AuthResult | Response> {
  const result = await extractUserKey(req);
  if (!result.userId) {
    return Response.json(
      { code: EC_AUTH_REQUIRED, message: "请先登录", error: "请先登录" },
      { status: 401 },
    );
  }
  return result;
}

/** 要求认证：未登录直接抛 RouteError（withRoute 包裹的路由使用，省去 instanceof 样板） */
export async function requireUserKeyOrThrow(req: NextRequest): Promise<AuthResult> {
  const result = await extractUserKey(req);
  if (!result.userId) {
    throw new RouteError(401, 40042, "请先登录");
  }
  return result;
}
