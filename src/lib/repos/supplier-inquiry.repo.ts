/**
 * 供应商询盘线索数据访问层
 *
 * @module lib/repos/supplier-inquiry.repo
 * @description 写入 supplier_inquiry（供应商企业主页的「发询盘」表单）。
 *              不读供应商联系方式明文：线索只记录用户主动填写的需求与可选联系方式，
 *              由运营在企业后台跟进。
 */
import type { Pool, ResultSetHeader } from "mysql2/promise";

export interface CreateSupplierInquiryInput {
  supplierId: number;
  userId: number;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  demand: string;
  quantity: string | null;
  locale: string;
  source: string;
  clientIp: string | null;
  userAgent: string | null;
}

export class SupplierInquiryRepo {
  constructor(private pool: Pool) {}

  /** 创建一条询盘线索，返回自增 id */
  async create(input: CreateSupplierInquiryInput): Promise<number> {
    const [res] = await this.pool.query<ResultSetHeader>(
      `INSERT INTO supplier_inquiry
         (supplier_id, user_id, contact_name, contact_phone, contact_email,
          demand, quantity, locale, source, client_ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.supplierId,
        input.userId,
        input.contactName,
        input.contactPhone,
        input.contactEmail,
        input.demand,
        input.quantity,
        input.locale,
        input.source,
        input.clientIp,
        input.userAgent,
      ],
    );
    return Number(res.insertId);
  }
}
