/**
 * 注册后回溯关联服务
 * Post-Registration Backfill Service
 *
 * @module lib/services/registration-backfill
 * @description 注册成功后，按手机号回溯关联孤立的诊断评估记录。
 *              作为独立服务，避免 auth-register 直接依赖 SupplierQualificationRepo。
 *              失败不阻断注册主流程。
 */
import { getPool } from "../db/pool";
import { SupplierQualificationRepo } from "../repos/supplier-qualification.repo";

/**
 * 回溯关联诊断评估记录
 * @param phone - 用户手机号
 * @param userId - 新用户 ID
 * @returns 关联的记录数
 */
export async function backfillQualificationByPhone(
  phone: string,
  userId: number,
): Promise<number> {
  try {
    const qualRepo = new SupplierQualificationRepo(getPool());
    return await qualRepo.backfillByPhone(phone, userId);
  } catch (err) {
    console.warn("[registration-backfill] 诊断记录回溯关联失败:", (err as Error).message);
    return 0;
  }
}
