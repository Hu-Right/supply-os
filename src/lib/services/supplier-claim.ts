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
 * 清理过期认领：解除用户绑定 + 重置供应商状态
 * 跨域操作：crm_supplier_claims + crm_users + supplier
 * @returns 清理的记录数
 */
export async function releaseExpiredClaims(): Promise<number> {
  const pool = getPool();
  const [result] = await pool.execute(
    `UPDATE crm_supplier_claims c
     JOIN crm_users u ON u.id = c.user_id
     JOIN supplier s ON s.id = c.supplier_id
     SET u.supplier_id = NULL, u.supplier_link_status = 'none',
         s.claim_status = NULL,
         c.status = 'expired'
     WHERE c.status = 'pending' AND c.expires_at < NOW()`,
  );
  return Number((result as any).affectedRows);
}
