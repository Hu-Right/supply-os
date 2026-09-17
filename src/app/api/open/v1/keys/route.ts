/**
 * /api/open/v1/keys — API Key 管理（内部管理员用）
 *
 * @module app/api/open/v1/keys/route
 * @description 管理员通过 JWT 认证创建/管理 API Key。
 *              创建时返回明文 Key（仅此一次），后续只能看到前缀。
 *
 * GET  — 列出所有 Key（不返回 hash/明文）
 * POST — 创建新 Key（body: { name, tier?, daily_quota?, rate_limit_per_min?, expires_at? }）
 * PATCH — 更新 Key 状态或配置（body: { key_id, status?, tier?, daily_quota?, rate_limit_per_min? }）
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { withRoute, routeError, parseJson } from "@/lib/middleware/route-handler";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import type { ApiKeyTier, ApiKeyStatus } from "@/lib/repos/open-api.repo";

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  tier: z.enum(["basic", "pro"]).default("basic"),
  daily_quota: z.number().int().min(1).max(100000).default(1000),
  rate_limit_per_min: z.number().int().min(1).max(1000).default(60),
  expires_at: z.string().optional(),
});

const updateKeySchema = z.object({
  key_id: z.number().int().positive(),
  status: z.enum(["active", "suspended", "revoked"]).optional(),
  tier: z.enum(["basic", "pro"]).optional(),
  daily_quota: z.number().int().min(1).max(100000).optional(),
  rate_limit_per_min: z.number().int().min(1).max(1000).optional(),
});

// GET: 列出所有 Key
export const GET = withRoute(async (req: NextRequest) => {
  await requireUserKeyOrThrow(req);
  const ctx = getContext();
  const keys = await ctx.openApiRepo.listKeys();
  return NextResponse.json({ keys });
});

// POST: 创建新 Key
export const POST = withRoute(async (req: NextRequest) => {
  await requireUserKeyOrThrow(req);
  const body = await parseJson(req, createKeySchema);
  const ctx = getContext();

  const result = await ctx.openApiRepo.createKey(
    body.name,
    body.tier as ApiKeyTier,
    body.daily_quota,
    body.rate_limit_per_min,
    body.expires_at,
  );

  return NextResponse.json({
    id: result.id,
    key_prefix: result.key_prefix,
    /** 明文 Key — 仅此一次返回，调用方须自行保管 */
    api_key: result.plaintext_key,
    message: "请妥善保存 api_key，此值不会再次返回",
  }, { status: 201 });
});

// PATCH: 更新 Key 状态或配置
export const PATCH = withRoute(async (req: NextRequest) => {
  await requireUserKeyOrThrow(req);
  const body = await parseJson(req, updateKeySchema);
  const ctx = getContext();

  if (body.status) {
    const ok = await ctx.openApiRepo.updateKeyStatus(body.key_id, body.status as ApiKeyStatus);
    if (!ok) routeError(404, 40044, "API Key 不存在");
  }

  if (body.tier || body.daily_quota || body.rate_limit_per_min) {
    // 先查当前配置，缺的用原值填充
    const keys = await ctx.openApiRepo.listKeys();
    const target = keys.find((k) => k.id === body.key_id);
    if (!target) routeError(404, 40044, "API Key 不存在");

    const ok = await ctx.openApiRepo.updateKeyConfig(
      body.key_id,
      (body.tier as ApiKeyTier) ?? target.tier,
      body.daily_quota ?? target.daily_quota,
      body.rate_limit_per_min ?? target.rate_limit_per_min,
    );
    if (!ok) routeError(404, 40044, "API Key 更新失败");
  }

  return NextResponse.json({ success: true });
});
