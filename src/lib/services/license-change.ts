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
