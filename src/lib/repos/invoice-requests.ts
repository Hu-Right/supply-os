/**
 * 发票申请仓储（费用中心「发票管理」）
 *
 * @module lib/repos/invoice-requests
 * @description 只做数据访问：按用户列出/创建开票申请；状态流转由财务后台人工处理。
 *              发票金额按订单实付金额，不做二次计算（调用方负责校验与汇总）。
 */
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

export interface InvoiceRequestRow {
  id: number;
  userId: number;
  orderNos: string[];
  amount: number;
  invoiceType: "normal" | "special";
  title: string;
  taxNo: string | null;
  email: string;
  addressPhone: string | null;
  status: "pending" | "issuing" | "issued" | "void" | "red_flushed";
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvoiceRequestInput {
  orderNos: string[];
  amount: number;
  invoiceType: "normal" | "special";
  title: string;
  taxNo?: string | null;
  email: string;
  addressPhone?: string | null;
}

type Row = RowDataPacket & {
  id: number;
  user_id: number;
  order_nos: string;
  amount: string | number;
  invoice_type: string;
  title: string;
  tax_no: string | null;
  email: string;
  address_phone: string | null;
  status: string;
  remark: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const toIso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

function mapRow(r: Row): InvoiceRequestRow {
  return {
    id: Number(r.id),
    userId: Number(r.user_id),
    orderNos: String(r.order_nos || "").split(",").map((s) => s.trim()).filter(Boolean),
    amount: Number(r.amount),
    invoiceType: r.invoice_type === "special" ? "special" : "normal",
    title: r.title,
    taxNo: r.tax_no,
    email: r.email,
    addressPhone: r.address_phone,
    status: (["pending", "issuing", "issued", "void", "red_flushed"].includes(r.status)
      ? r.status
      : "pending") as InvoiceRequestRow["status"],
    remark: r.remark,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  };
}

/** 列出用户的开票申请（按申请时间倒序） */
export async function listInvoiceRequests(pool: Pool, userId: number, limit = 50): Promise<InvoiceRequestRow[]> {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const [rows] = await pool.query<Row[]>(
    `SELECT id, user_id, order_nos, amount, invoice_type, title, tax_no, email, address_phone,
            status, remark, created_at, updated_at
       FROM invoice_requests
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?`,
    [userId, safeLimit],
  );
  return rows.map(mapRow);
}

/** 创建开票申请（同一订单可重复申请由财务侧核销，服务端只做基础校验） */
export async function createInvoiceRequest(
  pool: Pool,
  userId: number,
  input: CreateInvoiceRequestInput,
): Promise<InvoiceRequestRow> {
  const orderNos = [...new Set(input.orderNos.map((s) => s.trim()).filter(Boolean))];
  const [res] = await pool.query<ResultSetHeader>(
    `INSERT INTO invoice_requests
       (user_id, order_nos, amount, invoice_type, title, tax_no, email, address_phone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      orderNos.join(","),
      input.amount.toFixed(2),
      input.invoiceType,
      input.title,
      input.taxNo ?? null,
      input.email,
      input.addressPhone ?? null,
    ],
  );
  const [rows] = await pool.query<Row[]>(
    `SELECT id, user_id, order_nos, amount, invoice_type, title, tax_no, email, address_phone,
            status, remark, created_at, updated_at
       FROM invoice_requests WHERE id = ?`,
    [res.insertId],
  );
  return mapRow(rows[0]);
}
