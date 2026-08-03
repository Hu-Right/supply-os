/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 供应商数据访问层（supplier 目录表 + crm_suppliers 注册表 + 认领）
 * Suppliers Repository
 *
 * @module repos/suppliers.repo
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

/** 供应商目录行（supplier 表） */
export interface SupplierDirectoryRow {
  id: number;
  company: string | null;
  country: string | null;
  country_code: string | null;
  province: string | null;
  city: string | null;
  contact: string | null;
  phone: string | null;
  email: string | null;
  products: string | null;
  industry: string | null;
  type: string | null;
}

/** 供应商译文行（crm_supplier_translations） */
export interface SupplierTranslationRow {
  supplier_id: number;
  industry_tr: string | null;
  main_products_tr: string | null;
  certification_tr: string | null;
}

export class SuppliersRepo {
  constructor(private pool: Pool) {}

  /** 查供应商基本信息（auth 路由用） */
  async findBasicInfo(id: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      "SELECT id, industry_id, industry FROM crm_suppliers WHERE id = ? LIMIT 1",
      [id],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 供应商目录（排除测试数据，最新 500 家） */
  async listDirectory(): Promise<SupplierDirectoryRow[]> {
    const [rows] = await this.pool.query(
      `SELECT id, company, country, country_code, province, city, contact, phone, email, products, industry, type
       FROM supplier
       WHERE company <> '测试'
       ORDER BY id DESC
       LIMIT 500`,
    );
    return rows as SupplierDirectoryRow[];
  }

  /** 批量取指定语言译文 */
  async listTranslations(lang: string, supplierIds: number[]): Promise<SupplierTranslationRow[]> {
    const [rows] = await this.pool.query(
      `SELECT supplier_id, industry_tr, main_products_tr, certification_tr
       FROM crm_supplier_translations
       WHERE lang = ? AND supplier_id IN (?)`,
      [lang, supplierIds],
    );
    return rows as SupplierTranslationRow[];
  }

  /** 译文 upsert（后台补翻落库） */
  async upsertTranslation(
    supplierId: number,
    lang: string,
    industryTr: string,
    mainProductsTr: string,
    model: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO crm_supplier_translations (supplier_id, lang, industry_tr, main_products_tr, model)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE industry_tr = VALUES(industry_tr), main_products_tr = VALUES(main_products_tr),
         model = VALUES(model)`,
      [supplierId, lang, industryTr, mainProductsTr, model],
    );
  }

  /** 供应商明文联系方式（VIP 端点） */
  async findContact(supplierId: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      "SELECT contact, phone, email FROM supplier WHERE id = ? LIMIT 1",
      [supplierId],
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

  /** 提交供应商认领，返回自增 id */
  async insertClaim(params: {
    userKey: string;
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
        (user_id, user_key, supplier_id, company_name, supplier_type, contact_name, contact_phone, contact_email, business_license_no, status)
       VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        params.userKey, params.userKey, params.supplierId, params.companyName, params.supplierType,
        params.contactName, params.contactPhone, params.contactEmail, params.businessLicenseNo,
      ],
    );
    return Number((result as RowDataPacket).insertId);
  }
}
