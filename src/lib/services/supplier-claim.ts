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
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { AppContext } from "../db/context";
import { getPool } from "../db/pool";
import { deleteFile } from "./file-upload";

export interface CreateClaimParams {
  userId: number;
  supplierId: number;
  /** 营业执照鉴权 URL；认领弹窗流程不带执照（用户后续在设置页限时上传），有则随认领落库 */
  licenseUrl?: string;
  expiresAt: string;
}

export interface CreateClaimResult {
  claimId: number;
  expiresAt: string;
}

/**
 * 创建认领记录并执行临时绑定（执照可选：有则随认领落库）
 * 跨域操作：crm_supplier_claims + crm_users + supplier
 * （2026-09-29 简化：联系人字段废弃；认领改为"确认即绑定 + 跳设置页限时上传执照"）
 */
export async function createClaimWithBinding(
  ctx: AppContext,
  params: CreateClaimParams,
): Promise<CreateClaimResult> {
  const { userId, supplierId, expiresAt } = params;

  // 1. 创建认领记录（联系方式置 NULL：账号即联系方式）
  const claimId = await ctx.supplier.claimRepo.insertClaim(params);

  // 2. 临时绑定用户到供应商
  await ctx.user.usersRepo.bindSupplier(userId, supplierId, "verified");

  // 3. 标记认领中；执照有则随认领落库（旧执照文件 best-effort 清理，防堆积）
  const pool = getPool();
  if (params.licenseUrl) {
    const [oldRows] = await pool.execute<RowDataPacket[]>(
      `SELECT license_url FROM supplier WHERE id = ? LIMIT 1`, [supplierId],
    );
    const oldUrl = String((oldRows as Array<{ license_url: string | null }>)[0]?.license_url ?? "") || null;
    await pool.execute(
      `UPDATE supplier SET claim_status = 'pending', license_url = ? WHERE id = ?`,
      [params.licenseUrl, supplierId],
    );
    if (oldUrl && oldUrl !== params.licenseUrl) {
      await deleteFile(oldUrl).catch(() => undefined);
    }
  } else {
    await pool.execute(
      `UPDATE supplier SET claim_status = 'pending' WHERE id = ?`,
      [supplierId],
    );
  }

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
