/**
 * 用户身份互斥判定（服务端强制点）
 * @module lib/services/identity
 * @description 企业信息与供应商资源库互斥（先用先占，决策记录见 docs/adr/0001）。
 *              前端拦截（settings 页/企业页）仅为体验层，真正的强制在此处：
 *              - 已绑定企业 = crm_users.supplier_id 非空（与 /api/user/enterprise GET 的
 *                bound 判定同一事实源）；
 *              - 已占用外贸员身份 = 供应商资源库非空。
 */
import type { Pool } from "mysql2/promise";
import { UsersRepo } from "../repos/users.repo";
import { UserSupplierPoolRepo } from "../repos/user-supplier-pool.repo";

/** 是否已绑定企业（crm_users.supplier_id 非空） */
export async function hasEnterpriseBinding(pool: Pool, userId: number): Promise<boolean> {
  const profile = await new UsersRepo(pool).findProfileById(userId);
  return Number(profile?.supplier_id || 0) > 0;
}

/** 是否已建立供应商资源库（互斥的另一侧：已占用外贸员身份） */
export async function hasSupplierPool(pool: Pool, userId: number): Promise<boolean> {
  return (await new UserSupplierPoolRepo(pool).countByUser(userId)) > 0;
}
