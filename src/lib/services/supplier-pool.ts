/**
 * 供应商资源库服务
 * @module lib/services/supplier-pool
 * @description 添加供应商的编排层：上限校验 → 平台目录匹配 → 未匹配时
 *              复用/创建 pending 基础记录，供应商行与资源库行在同一事务内落库，
 *              避免半途失败留下孤儿 supplier 行。路由层只做鉴权、校验与错误映射。
 */
import type { Pool } from "mysql2/promise";
import { UserSupplierPoolRepo } from "../repos/user-supplier-pool.repo";

/** 资源库容量上限（防滥用） */
export const MAX_POOL_SIZE = 50;

export type AddSupplierPoolResult =
  | { ok: true; poolId: number; source: "platform" | "manual"; supplierId: number }
  | { ok: false; reason: "pool_full" | "duplicate" | "not_found" };

/** 主入口：按公司名添加供应商（平台匹配 or 复用/创建 pending 记录） */
export async function addSupplierToPool(
  pool: Pool,
  userId: number,
  companyName: string,
): Promise<AddSupplierPoolResult> {
  const name = companyName.trim();
  const repo = new UserSupplierPoolRepo(pool);

  const count = await repo.countByUser(userId);
  if (count >= MAX_POOL_SIZE) {
    return { ok: false, reason: "pool_full" };
  }

  // ── 平台目录匹配：supplier_id 关联，继承全部数据（单条 INSERT IGNORE，天然原子） ──
  const matched = await repo.findVerifiedByCompany(name);
  if (matched) {
    const qualificationId = await repo.findLatestQualificationId(matched.id);
    const poolId = await repo.addFromPlatform(userId, matched.id, qualificationId);
    if (!poolId) {
      return { ok: false, reason: "duplicate" };
    }
    return { ok: true, poolId, source: "platform", supplierId: matched.id };
  }

  // ── 未匹配：优先复用同名的已有 pending 记录，避免每次添加都新建重复行 ──
  const existingPending = await repo.findPendingByExactCompany(name);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const supplierId = existingPending
      ? existingPending.id
      : await repo.createPendingSupplier(name, conn);
    const poolId = await repo.addManual(userId, supplierId, conn);
    await conn.commit();
    return { ok: true, poolId, source: "manual", supplierId };
  } catch (err) {
    await conn.rollback();
    // 复用 pending 记录时撞 uk_user_supplier（该供应商已在池中）→ 按重复处理而非 500
    if ((err as { code?: string })?.code === "ER_DUP_ENTRY") {
      return { ok: false, reason: "duplicate" };
    }
    throw err;
  } finally {
    conn.release();
  }
}

/** 候选确认入口：用户在候选列表中点选指定供应商后按 id 添加（不做模糊猜测） */
export async function addSupplierByIdToPool(
  pool: Pool,
  userId: number,
  supplierId: number,
): Promise<AddSupplierPoolResult> {
  const repo = new UserSupplierPoolRepo(pool);

  const count = await repo.countByUser(userId);
  if (count >= MAX_POOL_SIZE) {
    return { ok: false, reason: "pool_full" };
  }

  const matched = await repo.findVerifiedById(supplierId);
  if (!matched) {
    return { ok: false, reason: "not_found" };
  }
  const qualificationId = await repo.findLatestQualificationId(matched.id);
  const poolId = await repo.addFromPlatform(userId, matched.id, qualificationId);
  if (!poolId) {
    return { ok: false, reason: "duplicate" };
  }
  return { ok: true, poolId, source: "platform", supplierId: matched.id };
}

/** 候选搜索：供添加前预览平台目录（含"已在资源库"标记） */
export function searchPoolCandidates(pool: Pool, userId: number, keyword: string, limit = 8) {
  return new UserSupplierPoolRepo(pool).searchVerifiedByCompany(keyword.trim(), limit, userId);
}
