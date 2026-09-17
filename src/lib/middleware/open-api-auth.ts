/**
 * 开放 API — API Key 认证中间件
 * Open API — API Key authentication middleware
 *
 * @module lib/middleware/open-api-auth
 * @description 从 X-API-Key 请求头提取 API Key，校验有效性、状态、过期时间、每日配额。
 *              通过后返回 ApiKeyAuthResult，供路由层使用。
 *              每次成功调用自动 touch last_used_at 并记录用量。
 */
import "server-only";
import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { ApiKeyRow, ApiKeyTier } from "@/lib/repos/open-api.repo";
import {
  EC_API_KEY_INVALID,
  EC_API_KEY_EXPIRED,
  EC_API_KEY_SUSPENDED,
  EC_API_QUOTA_EXCEEDED,
} from "@/shared/constants/api";

export interface ApiKeyAuthResult {
  keyId: number;
  keyPrefix: string;
  name: string;
  tier: ApiKeyTier;
  rateLimitPerMin: number;
  dailyQuota: number;
}

/** 对明文 Key 做 SHA-256 哈希（与 repo 层一致） */
function hashKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/**
 * 校验 API Key 并返回认证结果。
 * 校验失败时返回 NextResponse（错误响应），成功返回 ApiKeyAuthResult。
 */
export async function authenticateOpenApiKey(
  req: NextRequest,
  repo: { findByHash: (hash: string) => Promise<ApiKeyRow | null>; getTodayUsage: (keyId: number) => Promise<number>; touchLastUsed: (keyId: number) => Promise<void> },
): Promise<ApiKeyAuthResult | NextResponse> {
  const apiKey = req.headers.get("x-api-key")?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { code: EC_API_KEY_INVALID, message: "缺少 X-API-Key 请求头" },
      { status: 401 },
    );
  }

  const keyHash = hashKey(apiKey);
  const keyRow = await repo.findByHash(keyHash);

  if (!keyRow) {
    return NextResponse.json(
      { code: EC_API_KEY_INVALID, message: "API Key 无效" },
      { status: 401 },
    );
  }

  if (keyRow.status === "revoked") {
    return NextResponse.json(
      { code: EC_API_KEY_INVALID, message: "API Key 已撤销" },
      { status: 401 },
    );
  }

  if (keyRow.status === "suspended") {
    return NextResponse.json(
      { code: EC_API_KEY_SUSPENDED, message: "API Key 已暂停，请联系管理员" },
      { status: 403 },
    );
  }

  // 过期检查
  if (keyRow.expires_at) {
    const expiresAt = new Date(keyRow.expires_at);
    if (expiresAt < new Date()) {
      return NextResponse.json(
        { code: EC_API_KEY_EXPIRED, message: "API Key 已过期" },
        { status: 401 },
      );
    }
  }

  // 每日配额检查
  const todayUsage = await repo.getTodayUsage(keyRow.id);
  if (todayUsage >= keyRow.daily_quota) {
    return NextResponse.json(
      { code: EC_API_QUOTA_EXCEEDED, message: `今日调用配额已用完（${keyRow.daily_quota} 次/天），请明日再试或升级套餐` },
      { status: 429 },
    );
  }

  // 异步 touch（不阻塞响应）
  repo.touchLastUsed(keyRow.id).catch(() => {});

  return {
    keyId: keyRow.id,
    keyPrefix: keyRow.key_prefix,
    name: keyRow.name,
    tier: keyRow.tier as ApiKeyTier,
    rateLimitPerMin: keyRow.rate_limit_per_min,
    dailyQuota: keyRow.daily_quota,
  };
}
