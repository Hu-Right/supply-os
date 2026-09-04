/**
 * Next.js Route Handler 认证 helper
 *
 * 从 JWT Access Token 提取 userId，供 Route Handler 使用。
 * userId 为唯一身份标识（crm_users.user_key 列退役路线图收尾）。
 */
import type { NextRequest } from "next/server";
import type { UserId } from "@/lib/types/identity";
import { RouteError } from "./route-handler";
import { EC_AUTH_REQUIRED } from "@/shared/constants/api";

export interface AuthResult {
  /** 内部用户 ID — 全系统唯一身份标识 */
  userId: UserId;
  /** 是否通过 JWT 认证（true=已登录；false=游客或 token 无效） */
  authViaJwt: boolean;
}

/** 从 Authorization 头部提取并验证 JWT，返回 userId */
export async function extractUserKey(req: NextRequest): Promise<AuthResult> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { userId: 0, authViaJwt: false };

  try {
    const { verifyAccessToken } = await import("@/lib/services/jwt");
    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);

    // uid 为唯一身份标识（user_key 已彻底从 payload 移除）
    const userId: UserId = payload.uid ?? 0;
    if (!userId) return { userId: 0, authViaJwt: false };

    return { userId, authViaJwt: true };
  } catch {
    return { userId: 0, authViaJwt: false };
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
