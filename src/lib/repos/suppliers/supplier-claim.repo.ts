/**
 * 供应商认领数据访问层
 * Supplier Claim Repository
 *
 * @module server/repos/suppliers/supplier-claim.repo
 * @description 操作 crm_supplier_claims 表：供应商认领流程。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export class SupplierClaimRepo {
  constructor(private pool: Pool) {}

  /** 提交供应商认领，返回自增 id */
  async insertClaim(params: {
    userId: number;
    supplierId: number | null;
    companyName: string;
    supplierType: string;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
    businessLicenseNo: string;
  }): Promise<number> {
    const [result] = await this.pool.execute(
      `INSERT INTO crm_supplier_claims
        (user_id, supplier_id, company_name, supplier_type, contact_name, contact_phone, contact_email, business_license_no, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        params.userId, params.supplierId, params.companyName, params.supplierType,
        params.contactName, params.contactPhone, params.contactEmail, params.businessLicenseNo,
      ],
    );
    return Number((result as RowDataPacket).insertId);
  }
}
