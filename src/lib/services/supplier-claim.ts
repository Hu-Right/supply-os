/**
 * 供应商认领编排服务
 * Supplier Claim Service
 *
 * @module lib/services/supplier-claim
 * @description 收口供应商认领流程的跨域编排：
 *              - 创建认领记录 + 临时绑定用户 + 标记供应商认领中
 *              - 过期认领清理（解除绑定 + 重置状态）
 *              避免 API 路由层直接操作多张表。
 */
import type { Pool, ResultSetHeader } from "mysql2/promise";
import type { AppContext } from "../db/context";
import { getPool } from "../db/pool";

export interface CreateClaimParams {
  userId: number;
  supplierId: number;
  companyName: string;
  supplierType: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  businessLicenseNo: string;
  expiresAt: string;
}

export interface CreateClaimResult {
  claimId: number;
  expiresAt: string;
}

/**
 * 创建认领记录并执行临时绑定
 * 跨域操作：crm_supplier_claims + crm_users + supplier
 */
export async function createClaimWithBinding(
  ctx: AppContext,
  params: CreateClaimParams,
): Promise<CreateClaimResult> {
  const { userId, supplierId, expiresAt } = params;

  // 1. 创建认领记录
  const claimId = await ctx.supplier.claimRepo.insertClaim(params);

  // 2. 临时绑定用户到供应商
  await ctx.user.usersRepo.bindSupplier(userId, supplierId, "verified");

  // 3. 标记供应商为认领中
  const pool = getPool();
  await pool.execute(
    `UPDATE supplier SET claim_status = 'pending' WHERE id = ?`,
    [supplierId],
  );

  return { claimId, expiresAt };
}

/**
 * 清理过期认领：解除用户绑定 + 重置供应商状态 + 认领记录置 expired
 * 跨域操作：crm_supplier_claims + crm_users + supplier
 *
 * 三重守卫，防止把已确定的归属误释放（数据史上有 pending 与 verified 并存的脏数据）：
 * - u 只按「仍绑定在该主体上」关联（LEFT JOIN … AND u.supplier_id = c.supplier_id）：
 *   用户已换绑/解绑时认领记录照样置 expired，但不动用户现状；
 * - 同用户对同主体已有 approved 认领（正式归属）的过期 pending 不释放，
 *   避免把审核通过的归属人踢下线；
 * - claim_status 仅在仍为 pending 时重置，不覆盖后台审核写出的 verified。
 *
 * @returns 释放的记录数（由 lib/lifecycle/timers 每小时调度，落实 7 天有效期）
 */
export async function releaseExpiredClaims(dbPool: Pool): Promise<number> {
  const [result] = await dbPool.query(
    `UPDATE crm_supplier_claims c
      LEFT JOIN crm_users u
        ON u.id = c.user_id AND u.supplier_id = c.supplier_id
      JOIN supplier s ON s.id = c.supplier_id
      LEFT JOIN (SELECT DISTINCT user_id, supplier_id
                   FROM crm_supplier_claims WHERE status = 'approved') ok
        ON ok.user_id = c.user_id AND ok.supplier_id = c.supplier_id
     SET u.supplier_id = NULL, u.supplier_link_status = 'none',
         s.claim_status = IF(s.claim_status = 'pending', NULL, s.claim_status),
         c.status = 'expired'
     WHERE c.status = 'pending' AND c.expires_at < NOW() AND ok.user_id IS NULL`,
  );
  return Number((result as ResultSetHeader).affectedRows);
}
