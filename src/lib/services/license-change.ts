/**
 * 已认证供应商换照变更流水（先审后生效）
 * License Change Review
 *
 * @module lib/services/license-change
 * @description 已通过认证（verify_status='done'）的供应商重新上传执照时：
 *              新图已存 crm_upload_files（本模块只登记不碰字节），变更写
 *              crm_license_changes 待审；supplier.license_url 保持旧图不动，
 *              后台人工「通过」后才切换，旧图永不删除（审计留痕）。
 *              未认证供应商的执照协调仍走认领流水（reconcileLicense 直写）。
 *              一个供应商同时最多一条 pending，新上传覆盖旧待审（被覆盖的
 *              待审文件仍留在 crm_upload_files 作审计字节）。
 */
import { getPool } from "../db/pool";

/** 创建或覆盖该供应商的待审换照记录 */
export async function upsertPendingLicenseChange(params: {
  supplierId: number;
  /** 新执照文件名（crm_upload_files）；null = 申请清空执照 */
  filename: string | null;
  /** 替换前的执照文件名（审计留痕）；null = 原本无执照 */
  prevFilename: string | null;
  uploadedBy: number;
}): Promise<void> {
  const pool = getPool();
  await pool.execute(
    `DELETE FROM crm_license_changes WHERE supplier_id = ? AND status = 'pending'`,
    [params.supplierId],
  );
  await pool.execute(
    `INSERT INTO crm_license_changes (supplier_id, filename, prev_filename, uploaded_by)
     VALUES (?, ?, ?, ?)`,
    [params.supplierId, params.filename, params.prevFilename, params.uploadedBy],
  );
}

/** 换照审核进展（前台状态源）：最新一单的状态，供企业信息页展示「审核中/被驳回」 */
export interface LicenseChangeBrief {
  id: number;
  status: "pending" | "approved" | "rejected";
  rejectReason: string | null;
  createdAt: string | null;
}

/** 读该供应商最近一条换照变更（任何状态）；从未换过照返回 null */
export async function latestLicenseChangeForSupplier(
  supplierId: number,
): Promise<LicenseChangeBrief | null> {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, status, reject_reason, created_at
       FROM crm_license_changes WHERE supplier_id = ?
      ORDER BY id DESC LIMIT 1`,
    [supplierId],
  );
  const row = (rows as Array<{
    id: number;
    status: LicenseChangeBrief["status"];
    reject_reason: string | null;
    created_at: Date | string | null;
  }>)[0];
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    rejectReason: row.reject_reason,
    createdAt: row.created_at
      ? row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at)
      : null,
  };
}
