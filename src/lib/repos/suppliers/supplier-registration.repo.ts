/**
 * 供应商注册数据访问层
 * Supplier Registration Repository
 *
 * @module server/repos/suppliers/supplier-registration.repo
 * @description 操作 crm_suppliers 自有表（注册记录）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export class SupplierRegistrationRepo {
  constructor(private pool: Pool) {}

  /** 查供应商基本信息（auth 路由用） */
  async findBasicInfo(id: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      "SELECT id, industry_id, industry FROM crm_suppliers WHERE id = ? LIMIT 1",
      [id],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 按请求哈希查注册记录（防重） */
  async findCrmByRequestHash(requestHash: string): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      "SELECT * FROM crm_suppliers WHERE request_hash = ? LIMIT 1",
      [requestHash],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 新建注册记录，返回自增 id */
  async insertCrmSupplier(data: {
    companyName: string;
    contactName: string;
    telephone: string;
    email: string;
    mainProduct: string;
    industry: string;
    certification: string;
    requestHash: string;
  }): Promise<number> {
    const [insertResult] = await this.pool.query(
      `INSERT INTO crm_suppliers
         (company_name, contact_name, telephone, email, main_product, industry, certification, created_at, request_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
      [
        data.companyName, data.contactName, data.telephone, data.email,
        data.mainProduct, data.industry, data.certification, data.requestHash,
      ],
    );
    return Number((insertResult as RowDataPacket).insertId);
  }

  /** 按 id 查注册记录全字段 */
  async findCrmById(id: number): Promise<any | null> {
    const [rows] = await this.pool.query(
      "SELECT * FROM crm_suppliers WHERE id = ? LIMIT 1",
      [id],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 按公司名查注册记录 id（认领关联，取最新一条） */
  async findCrmIdByCompanyName(companyName: string): Promise<number | null> {
    const [rows] = await this.pool.query(
      "SELECT id FROM crm_suppliers WHERE company_name = ? ORDER BY id DESC LIMIT 1",
      [companyName],
    );
    const row = (rows as RowDataPacket[])[0];
    return row ? Number(row.id) : null;
  }

}
