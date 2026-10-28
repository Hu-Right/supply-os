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
import { AiSummaryRepo } from "@/lib/repos/ai-summary.repo";
import {
  addSupplierToPool, addSupplierByIdToPool, listPoolSupplierViews, MAX_POOL_SIZE,
} from "@/lib/services/supplier-pool";
import { EC_POOL_FULL, EC_POOL_SUPPLIER_NOT_VERIFIED, EC_POOL_SUPPLIER_DUPLICATE } from "@/shared/constants/api";

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

  // V2（ADR-0004）：企业账号也可拥有并使用供应商资源库，不再按身份返回空列表。
  // 取数与行→视图都收在 service（命名红线② + 分层）：旧写法是路由 new repo 后
  // `json({ list: rows })`，于是 `pool_id`/`supplier_id`/`has_qualification`/`created_at`
  // 四个列名（含 SQL 别名）直接当对外键——POST 早就是 camel，只有 GET 漏了。
  const list = await listPoolSupplierViews(getContext().dbPool, auth.userId);
  return NextResponse.json({ list });
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

  const result = body.supplierId !== undefined
    ? await addSupplierByIdToPool(ctx.dbPool, auth.userId, body.supplierId)
    : await addSupplierToPool(ctx.dbPool, auth.userId, body.companyName!);

  if (!result.ok) {
    if (result.reason === "pool_full") {
      routeError(400, EC_POOL_FULL, `资源库已满（上限 ${MAX_POOL_SIZE} 个），请移除不用的供应商后再添加`);
    }
    if (result.reason === "not_found") {
      routeError(400, EC_POOL_SUPPLIER_NOT_VERIFIED, "供应商不存在或未通过认证");
    }
    routeError(400, EC_POOL_SUPPLIER_DUPLICATE, "该供应商已在你的资源库中");
  }

  await invalidateMatchCacheSafely(ctx.dbPool, auth.userId);
  return NextResponse.json({
    poolId: result.poolId, source: result.source, supplierId: result.supplierId,
  });
});
