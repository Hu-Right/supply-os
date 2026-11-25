/**
 * 发票申请仓储（费用中心「发票管理」）
 *
 * @module lib/repos/invoice-requests
 * @description 数据访问：申请创建、用户/财务列表、状态流转、开具结果回写、订单冲突查询。
 *              发票金额由调用方按订单实付金额计算；退款红冲由财务在后台推进状态。
 */
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { CreateInvoiceRequestInput, InvoiceRequestStatus, InvoiceRequestView } from "@/types/billing";

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
  issue_channel: string;
  provider: string | null;
  provider_request_id: string | null;
  invoice_no: string | null;
  invoice_file_url: string | null;
  file_type: string | null;
  issued_at: Date | string | null;
  operator_id: number | null;
  red_flush_of: number | null;
  reject_reason: string | null;
  remark: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const toIso = (v: Date | string | null): string | null => (v ? (v instanceof Date ? v.toISOString() : String(v)) : null);

function mapRow(r: Row): InvoiceRequestView {
  const status = (["pending", "issuing", "issued", "void", "red_flushed"].includes(r.status)
    ? r.status
    : "pending") as InvoiceRequestStatus;
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
    status,
    issueChannel: r.issue_channel === "api" ? "api" : "manual",
    provider: r.provider,
    providerRequestId: r.provider_request_id,
    invoiceNo: r.invoice_no,
    invoiceFileUrl: r.invoice_file_url,
    fileType: r.file_type,
    issuedAt: toIso(r.issued_at),
    operatorId: r.operator_id === null ? null : Number(r.operator_id),
    redFlushOf: r.red_flush_of === null ? null : Number(r.red_flush_of),
    rejectReason: r.reject_reason,
    remark: r.remark,
    createdAt: toIso(r.created_at) ?? "",
    updatedAt: toIso(r.updated_at) ?? "",
  };
}

const SELECT_COLUMNS = `id, user_id, order_nos, amount, invoice_type, title, tax_no, email, address_phone,
  status, issue_channel, provider, provider_request_id, invoice_no, invoice_file_url, file_type,
  issued_at, operator_id, red_flush_of, reject_reason, remark, created_at, updated_at`;

/** 用户自己的开票申请（按申请时间倒序） */
export async function listInvoiceRequests(pool: Pool, userId: number, limit = 50): Promise<InvoiceRequestView[]> {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const [rows] = await pool.query<Row[]>(
    `SELECT ${SELECT_COLUMNS} FROM invoice_requests WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
    [userId, safeLimit],
  );
  return rows.map(mapRow);
}

/** 财务处理列表（全部用户；可按状态过滤） */
export async function listAllInvoiceRequests(pool: Pool, status: string | null, limit = 100): Promise<InvoiceRequestView[]> {
  const safeLimit = Math.max(1, Math.min(limit, 200));
  const params: Array<string | number> = [];
  let where = "";
  if (status && ["pending", "issuing", "issued", "void", "red_flushed"].includes(status)) {
    where = "WHERE status = ?";
    params.push(status);
  }
  params.push(safeLimit);
  const [rows] = await pool.query<Row[]>(
    `SELECT ${SELECT_COLUMNS} FROM invoice_requests ${where} ORDER BY created_at ASC, id ASC LIMIT ?`,
    params,
  );
  return rows.map(mapRow);
}

export async function findInvoiceRequestById(pool: Pool, id: number): Promise<InvoiceRequestView | null> {
  const [rows] = await pool.query<Row[]>(`SELECT ${SELECT_COLUMNS} FROM invoice_requests WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

/** 创建开票申请 */
export async function createInvoiceRequest(
  pool: Pool,
  userId: number,
  input: CreateInvoiceRequestInput,
): Promise<InvoiceRequestView> {
  const orderNos = [...new Set(input.orderNos.map((s) => s.trim()).filter(Boolean))];
  const [res] = await pool.query<ResultSetHeader>(
    `INSERT INTO invoice_requests
       (user_id, order_nos, amount, invoice_type, title, tax_no, email, address_phone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, orderNos.join(","), input.amount.toFixed(2), input.invoiceType, input.title,
      input.taxNo ?? null, input.email, input.addressPhone ?? null],
  );
  const row = await findInvoiceRequestById(pool, Number(res.insertId));
  if (!row) throw new Error("发票申请创建后读取失败");
  return row;
}

/** 财务接单：待开票 → 开票中 */
export async function markInvoiceIssuing(pool: Pool, id: number, operatorId: number): Promise<void> {
  await pool.query(
    "UPDATE invoice_requests SET status = 'issuing', operator_id = ? WHERE id = ? AND status = 'pending'",
    [operatorId, id],
  );
}

/** 开具完成：录入发票号 + 文件 + 开具时间 */
export async function issueInvoiceRequest(
  pool: Pool,
  params: { id: number; invoiceNo: string; fileUrl: string; fileType: string; operatorId: number },
): Promise<void> {
  await pool.query(
    `UPDATE invoice_requests
        SET status = 'issued', invoice_no = ?, invoice_file_url = ?, file_type = ?,
            issued_at = NOW(), operator_id = ?
      WHERE id = ? AND status IN ('pending','issuing')`,
    [params.invoiceNo, params.fileUrl, params.fileType, params.operatorId, params.id],
  );
}

/** 状态回退/关闭：作废（开具前）、红冲（已开具后，需关联原单） */
export async function updateInvoiceStatus(
  pool: Pool,
  params: { id: number; status: "void" | "red_flushed"; reason?: string | null; redFlushOf?: number | null },
): Promise<void> {
  if (params.status === "void") {
    await pool.query(
      "UPDATE invoice_requests SET status = 'void', reject_reason = ? WHERE id = ? AND status IN ('pending','issuing')",
      [params.reason ?? null, params.id],
    );
    return;
  }
  await pool.query(
    "UPDATE invoice_requests SET status = 'red_flushed', reject_reason = ?, red_flush_of = ? WHERE id = ? AND status = 'issued'",
    [params.reason ?? null, params.redFlushOf ?? null, params.id],
  );
}

/** 该用户是否有未完结/已开具的发票占用了这些订单（防重复申请） */
export async function findActiveInvoiceConflicts(pool: Pool, userId: number, orderNos: string[]): Promise<InvoiceRequestView[]> {
  if (orderNos.length === 0) return [];
  const [rows] = await pool.query<Row[]>(
    `SELECT ${SELECT_COLUMNS} FROM invoice_requests
      WHERE user_id = ? AND status IN ('pending','issuing','issued') ORDER BY id DESC`,
    [userId],
  );
  const wanted = new Set(orderNos);
  return rows
    .map(mapRow)
    .filter((req) => req.orderNos.some((no) => wanted.has(no)));
}

/** 查询用户指定的已支付订单（服务端重算金额，不信任前端） */
export async function listPaidOrdersByNos(
  pool: Pool,
  userId: number,
  orderNos: string[],
): Promise<Array<{ orderNo: string; amount: number }>> {
  if (orderNos.length === 0) return [];
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT order_no, amount FROM orders WHERE user_id = ? AND status = 'paid' AND order_no IN (?)`,
    [userId, orderNos],
  );
  return rows.map((r) => ({ orderNo: String(r.order_no), amount: Number(r.amount) }));
}
