/**
 * GET /api/user/supplier-pool — 列出我的供应商资源库
 * POST /api/user/supplier-pool — 添加供应商
 *
 * @module app/api/user/supplier-pool/route
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Pool } from "mysql2/promise";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError, parseJson } from "@/lib/middleware/route-handler";
import { UserSupplierPoolRepo } from "@/lib/repos/user-supplier-pool.repo";
import { AiSummaryRepo } from "@/lib/repos/ai-summary.repo";
import { hasEnterpriseBinding } from "@/lib/services/identity";
import { addSupplierToPool, addSupplierByIdToPool } from "@/lib/services/supplier-pool";
import { EC_INVALID_PARAMS, EC_FORBIDDEN } from "@/shared/constants/api";

/** 资源库变更后失效该用户的匹配缓存（失败不影响主流程，仅记录日志） */
async function invalidateMatchCacheSafely(dbPool: Pool, userId: number): Promise<void> {
  try {
    await new AiSummaryRepo(dbPool).removeMatchByUser(userId);
  } catch (err) {
    console.error("[supplier-pool] 匹配缓存失效失败:", err instanceof Error ? err.message : err);
  }
}

/** GET: 列出我的供应商资源库 */
export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const ctx = getContext();

  // 身份互斥（ADR-0001）：已绑定企业账号的资源库恒为空。
  // 返回空列表而非 403——useHasSupplierPool 会对所有登录用户发本请求，403 只会制造噪声。
  if (await hasEnterpriseBinding(ctx.dbPool, auth.userId)) {
    return NextResponse.json({ code: 0, message: "ok", data: { list: [] } });
  }

  const repo = new UserSupplierPoolRepo(ctx.dbPool);
  const items = await repo.listByUser(auth.userId);
  return NextResponse.json({ code: 0, message: "ok", data: { list: items } });
});

const addBodySchema = z.object({
  companyName: z.string().min(1).max(200).optional(),
  /** 候选确认模式：用户在候选列表点选的供应商 id（优先于 companyName） */
  supplierId: z.number().int().positive().optional(),
}).refine(
  (d) => (d.companyName !== undefined && d.companyName.trim() !== "") || d.supplierId !== undefined,
  { message: "companyName 与 supplierId 至少提供一个" },
);

/** POST: 添加供应商（supplierId=候选确认添加；companyName=按名匹配或新建；编排下沉 lib/services/supplier-pool） */
export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const body = await parseJson(req, addBodySchema);
  const ctx = getContext();

  // 身份互斥（ADR-0001）：已绑定企业账号不可使用供应商资源库（前端 settings 页拦截之外的强制点）
  if (await hasEnterpriseBinding(ctx.dbPool, auth.userId)) {
    routeError(403, EC_FORBIDDEN, "已绑定企业的账号不可使用供应商资源库，请先在企业身份下使用 AI 适配评分");
  }

  const result = body.supplierId !== undefined
    ? await addSupplierByIdToPool(ctx.dbPool, auth.userId, body.supplierId)
    : await addSupplierToPool(ctx.dbPool, auth.userId, body.companyName!);

  if (!result.ok) {
    if (result.reason === "pool_full") {
      routeError(400, 40020, "资源库已满（上限 50 个），请移除不用的供应商后再添加");
    }
    if (result.reason === "not_found") {
      routeError(400, EC_INVALID_PARAMS, "供应商不存在或未通过认证");
    }
    routeError(400, 40021, "该供应商已在你的资源库中");
  }

  await invalidateMatchCacheSafely(ctx.dbPool, auth.userId);
  return NextResponse.json({
    code: 0, message: "ok",
    data: { poolId: result.poolId, source: result.source, supplierId: result.supplierId },
  });
});
