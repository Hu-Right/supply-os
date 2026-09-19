/**
 * GET /api/user/supplier-pool — 列出我的供应商资源库
 * POST /api/user/supplier-pool — 添加供应商
 *
 * @module app/api/user/supplier-pool/route
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError, parseJson } from "@/lib/middleware/route-handler";
import { UserSupplierPoolRepo } from "@/lib/repos/user-supplier-pool.repo";
import { AiSummaryRepo } from "@/lib/repos/ai-summary.repo";
import { hasEnterpriseBinding } from "@/lib/services/identity";
import { EC_INVALID_PARAMS, EC_FORBIDDEN } from "@/shared/constants/api";

const MAX_POOL_SIZE = 50;

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
  companyName: z.string().min(1).max(200),
});

/** POST: 添加供应商（输入公司名称 → 搜索平台目录 → 匹配或创建） */
export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const body = await parseJson(req, addBodySchema);
  const ctx = getContext();

  // 身份互斥（ADR-0001）：已绑定企业账号不可使用供应商资源库（前端 settings 页拦截之外的强制点）
  if (await hasEnterpriseBinding(ctx.dbPool, auth.userId)) {
    routeError(403, EC_FORBIDDEN, "已绑定企业的账号不可使用供应商资源库，请先在企业身份下使用 AI 适配评分");
  }

  const poolRepo = new UserSupplierPoolRepo(ctx.dbPool);

  // 检查上限
  const count = await poolRepo.countByUser(auth.userId);
  if (count >= MAX_POOL_SIZE) {
    routeError(400, 40020, "资源库已满（上限 50 个），请移除不用的供应商后再添加");
  }

  const companyName = body.companyName.trim();

  // 搜索平台供应商目录（仅搜索已认证的）
  const matched = await findSupplierByCompany(ctx.dbPool, companyName);

  if (matched) {
    // 匹配到平台供应商
    const qualId = await findQualificationId(ctx.dbPool, matched.id);
    const poolId = await poolRepo.addFromPlatform(auth.userId, matched.id, qualId);
    if (!poolId) {
      routeError(400, 40021, "该供应商已在你的资源库中");
    }
    await invalidateMatchCacheSafely(ctx.dbPool, auth.userId);
    return NextResponse.json({ code: 0, message: "ok", data: { poolId, source: "platform", supplierId: matched.id } });
  }

  // 未匹配到：创建 supplier 记录（仅 company 字段，verify_status='pending' 不进入公共目录）
  const [insertResult] = await ctx.dbPool.execute(
    "INSERT INTO supplier (company, verify_status, created_at) VALUES (?, 'pending', NOW())",
    [companyName],
  );
  const newSupplierId = Number((insertResult as any).insertId);
  const poolId = await poolRepo.addManual(auth.userId, newSupplierId);
  await invalidateMatchCacheSafely(ctx.dbPool, auth.userId);
  return NextResponse.json({ code: 0, message: "ok", data: { poolId, source: "manual", supplierId: newSupplierId } });
});

/** 按公司名搜索平台供应商（精确 + 模糊，仅已认证） */
async function findSupplierByCompany(pool: Pool, company: string) {
  // 先精确匹配
  const [exact] = await pool.query(
    `SELECT id, company, industry FROM supplier
     WHERE company = ? AND (verify_status = 'done' OR verify_status IS NULL)
     LIMIT 1`,
    [company],
  );
  if ((exact as RowDataPacket[]).length > 0) return (exact as RowDataPacket[])[0];
  // 再模糊匹配
  const [fuzzy] = await pool.query(
    `SELECT id, company, industry FROM supplier
     WHERE company LIKE ? AND (verify_status = 'done' OR verify_status IS NULL)
     ORDER BY CHAR_LENGTH(company) ASC LIMIT 1`,
    [`%${company}%`],
  );
  return (fuzzy as RowDataPacket[]).length > 0 ? (fuzzy as RowDataPacket[])[0] : null;
}

/** 查找供应商关联的最新诊断记录 ID */
async function findQualificationId(pool: Pool, supplierId: number): Promise<number | null> {
  const [rows] = await pool.query(
    `SELECT q.id FROM crm_supplier_qualification q
     INNER JOIN crm_users u ON u.id = q.user_id
     WHERE u.supplier_id = ?
     ORDER BY q.id DESC LIMIT 1`,
    [supplierId],
  );
  return (rows as RowDataPacket[])[0]?.id ?? null;
}
