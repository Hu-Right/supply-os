/**
 * 采购需求 · 供应商响应（RFQ P0）
 *
 * @module lib/services/procurement/responses
 *
 * @description 供应商侧唯一写入口：草稿 → 提交（密封 + 回执）→ 截止前撤回。一家一版一条，
 *              唯一键 `(project_id, version_no, supplier_id)`；撤回后可重新提交同一行。
 *              密封口径：提交后内容除本人外不可见，采购方在开标前只能拿到份数
 *              （见 listResponsesForBuyer），开标由 opening.ts 的定时任务完成。
 */
import { createHash } from "node:crypto";
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import {
  PROCUREMENT_METHOD,
  RESPONSE_STATUS,
  RESPONSE_TRANSITIONS,
  TENDER_STATUS,
} from "@/shared/constants/procurement";
import type { ProjectRow } from "./projects";

const SHANGHAI_OFFSET_SEC = 8 * 3600;

export interface SupplierTenderRow extends RowDataPacket {
  id: number;
  project_id: number;
  version_no: number;
  tender_no: string;
  publish_mode: string;
  sealed: number;
  award_method: string;
  status: string;
  published_at: number;
  deadline_at: number | null;
  opened_at: number | null;
}

export interface ResponseRow extends RowDataPacket {
  id: number;
  project_id: number;
  version_no: number;
  tender_id: number;
  supplier_id: number;
  user_id: number;
  method: string;
  status: string;
  currency: string;
  incoterm: string | null;
  incoterm_place: string | null;
  validity_days: number | null;
  lead_time_days: number | null;
  tax_included: number;
  remark: string | null;
  receipt_no: string | null;
  receipt_hash: string | null;
  sealed_until: number;
  submitted_at: number | null;
  withdrawn_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface ResponseItemRow extends RowDataPacket {
  id: number;
  response_id: number;
  item_id: number | null;
  lot_id: number | null;
  seq: number;
  unit_price: string | null;
  quantity: string | null;
  uom: string | null;
  lead_time_days: number | null;
  moq: string | null;
  brand_model: string | null;
  compliance: unknown;
  remark: string | null;
}

export interface ResponseFileRow extends RowDataPacket {
  id: number;
  response_id: number;
  envelope: string;
  doc_kind: string;
  file_key: string;
  file_name: string;
  file_hash: string;
  file_size: number;
  created_at: number;
}

export interface ResponseItemInput {
  itemId?: number | null;
  lotId?: number | null;
  unitPrice?: string | number | null;
  quantity?: string | number | null;
  uom?: string | null;
  leadTimeDays?: number | null;
  moq?: string | number | null;
  brandModel?: string | null;
  compliance?: unknown;
  remark?: string | null;
}

/** 业务结果：成功带数据，失败带语义化原因（路由层映射为错误码） */
export type ResponseResult<T> =
  | ({ ok: true } & T)
  | {
      ok: false;
      reason:
        | "not_found"
        | "forbidden"
        | "project_not_published"
        | "tender_not_open"
        | "closed"
        | "state_invalid"
        | "no_items";
    };

/** users.supplier_id + supplier_link_status='verified' → supplier.id */
export async function resolveSupplierIdForUser(db: Pool, userId: number): Promise<number | null> {
  const [rows] = await db.query(
    "SELECT supplier_id FROM users WHERE id = ? AND supplier_link_status = 'verified' AND supplier_id IS NOT NULL LIMIT 1",
    [userId],
  );
  const id = Number((rows as Array<{ supplier_id: number | null }>)[0]?.supplier_id ?? 0);
  return id > 0 ? id : null;
}

/** 项目当前有效标讯（同项目可能有历史版本标讯，取最新一条） */
export async function loadLatestTender(db: Pool, projectId: number): Promise<SupplierTenderRow | null> {
  const [rows] = await db.query(
    `SELECT id, project_id, version_no, tender_no, publish_mode, sealed, award_method,
            status, published_at, deadline_at, opened_at
       FROM procurement_tenders
      WHERE project_id = ?
      ORDER BY id DESC
      LIMIT 1`,
    [projectId],
  );
  return ((rows as SupplierTenderRow[])[0] ?? null) || null;
}

function hasPassed(deadline: number | null, at: number): boolean {
  return deadline != null && deadline > 0 && deadline <= at;
}

/** 时间秒 → 上海时区年份（回执编号与项目编号口径一致） */
function shanghaiYear(at: number): number {
  return new Date((at + SHANGHAI_OFFSET_SEC) * 1000).getUTCFullYear();
}

/** 回执哈希：项目/版本/标讯/供应商 + 明细哈希 + 附件哈希 + 提交时间 */
export function computeReceiptHash(input: {
  projectId: number;
  versionNo: number;
  tenderId: number;
  supplierId: number;
  items: Array<{
    item_id: number | null;
    lot_id: number | null;
    seq: number;
    unit_price: string | null;
    quantity: string | null;
    lead_time_days: number | null;
  }>;
  files: Array<{ file_hash: string }>;
  submittedAt: number;
}): string {
  const items = [...input.items]
    .sort((a, b) => a.seq - b.seq || Number(a.item_id ?? 0) - Number(b.item_id ?? 0))
    .map((it) => [it.item_id, it.lot_id, it.seq, it.unit_price, it.quantity, it.lead_time_days]);
  const itemsHash = createHash("sha256").update(JSON.stringify(items), "utf8").digest("hex");
  const filesHash = createHash("sha256")
    .update(JSON.stringify(input.files.map((f) => f.file_hash).sort()), "utf8")
    .digest("hex");
  return createHash("sha256")
    .update(
      `OSRP|${input.projectId}|${input.versionNo}|${input.tenderId}|${input.supplierId}|${itemsHash}|${filesHash}|${input.submittedAt}`,
      "utf8",
    )
    .digest("hex");
}

export function formatReceiptNo(id: number, at: number): string {
  return `OSRP-${shanghaiYear(at)}-${String(id).padStart(6, "0")}`;
}

async function loadResponseRow(conn: Pool, responseId: number): Promise<ResponseRow | null> {
  const [rows] = await conn.query("SELECT * FROM procurement_responses WHERE id = ? LIMIT 1", [responseId]);
  return ((rows as ResponseRow[])[0] ?? null) || null;
}

async function loadItems(db: Pool, responseId: number): Promise<ResponseItemRow[]> {
  const [rows] = await db.query(
    `SELECT id, response_id, item_id, lot_id, seq, unit_price, quantity, uom,
            lead_time_days, moq, brand_model, compliance, remark
       FROM procurement_response_items
      WHERE response_id = ?
      ORDER BY seq, id`,
    [responseId],
  );
  return rows as ResponseItemRow[];
}

async function loadFiles(db: Pool, responseId: number): Promise<ResponseFileRow[]> {
  const [rows] = await db.query(
    `SELECT id, response_id, envelope, doc_kind, file_key, file_name, file_hash, file_size, created_at
       FROM procurement_response_files
      WHERE response_id = ?
      ORDER BY id`,
    [responseId],
  );
  return rows as ResponseFileRow[];
}

/** 归属：本人提交，或同一供应商主体的其他账号 */
async function canAccess(db: Pool, row: ResponseRow, userId: number): Promise<boolean> {
  if (Number(row.user_id) === Number(userId)) return true;
  const supplierId = await resolveSupplierIdForUser(db, userId);
  return supplierId != null && Number(row.supplier_id) === supplierId;
}

export interface ResponseDetail {
  response: ResponseRow;
  items: ResponseItemRow[];
  files: ResponseFileRow[];
  total: string;
  currency: string;
}

function sumTotal(items: ResponseItemRow[]): string {
  let total = 0;
  for (const it of items) {
    const price = Number(it.unit_price);
    const qty = Number(it.quantity);
    if (Number.isFinite(price) && Number.isFinite(qty)) total += price * qty;
  }
  return total.toFixed(2);
}

/**
 * 创建或取回本人草稿。
 * 已提交 → 原样返回（前端据此显示回执）；已撤回 → 返回原行，改稿后重新提交。
 */
export async function createOrGetDraft(
  db: Pool,
  input: { projectId: number; userId: number; at?: number },
): Promise<ResponseResult<ResponseDetail>> {
  const at = input.at ?? Math.floor(Date.now() / 1000);

  // 先判需求存在与状态，再判供应商绑定：未知项目一律 404，不因账号是否绑定而变
  const [pRows] = await db.query(
    "SELECT id, status, method, version_no FROM procurement_projects WHERE id = ? LIMIT 1",
    [input.projectId],
  );
  const project = (pRows as Array<{ id: number; status: string; method: string; version_no: number }>)[0];
  if (!project) return { ok: false, reason: "not_found" };
  if (project.status !== "published") return { ok: false, reason: "project_not_published" };
  if (String(project.method) !== PROCUREMENT_METHOD.RFQ) return { ok: false, reason: "state_invalid" };

  const supplierId = await resolveSupplierIdForUser(db, input.userId);
  if (!supplierId) return { ok: false, reason: "forbidden" };

  const tender = await loadLatestTender(db, input.projectId);
  if (!tender) return { ok: false, reason: "not_found" };
  if (tender.status !== TENDER_STATUS.PUBLISHED) return { ok: false, reason: "closed" };
  if (hasPassed(tender.deadline_at, at)) return { ok: false, reason: "closed" };

  const [existing] = await db.query(
    "SELECT * FROM procurement_responses WHERE project_id = ? AND version_no = ? AND supplier_id = ? LIMIT 1",
    [input.projectId, project.version_no, supplierId],
  );
  let row: ResponseRow | null = (existing as ResponseRow[])[0] ?? null;
  if (row === null) {
    const [ins] = await db.query<ResultSetHeader>(
      `INSERT INTO procurement_responses
         (project_id, version_no, tender_id, supplier_id, user_id, method, status,
          currency, sealed_until, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', 'CNY', ?, ?, ?)`,
      [input.projectId, project.version_no, tender.id, supplierId, input.userId, PROCUREMENT_METHOD.RFQ, tender.deadline_at ?? 0, at, at],
    );
    const created = await loadResponseRow(db, Number(ins.insertId));
    if (!created) return { ok: false, reason: "not_found" };
    row = created;
  }

  const items = await loadItems(db, row.id);
  const files = await loadFiles(db, row.id);
  return { ok: true, response: row, items, files, total: sumTotal(items), currency: row.currency };
}

/** 读本人响应（含明细与附件） */
export async function getResponseDetail(
  db: Pool,
  input: { responseId: number; userId: number },
): Promise<ResponseResult<ResponseDetail>> {
  const row = await loadResponseRow(db, input.responseId);
  if (!row) return { ok: false, reason: "not_found" };
  if (!(await canAccess(db, row, input.userId))) return { ok: false, reason: "forbidden" };
  const items = await loadItems(db, row.id);
  const files = await loadFiles(db, row.id);
  return { ok: true, response: row, items, files, total: sumTotal(items), currency: row.currency };
}

export interface ResponsePatch {
  currency?: string;
  incoterm?: string | null;
  incotermPlace?: string | null;
  validityDays?: number | null;
  leadTimeDays?: number | null;
  taxIncluded?: boolean;
  remark?: string | null;
  /** 传了就整组替换（P0 明细量小，避免行级 diff 的合并复杂度） */
  items?: ResponseItemInput[];
}

/** 改稿：只允许 draft；截止已过或标讯已关闭一律拒绝 */
export async function updateDraft(
  db: Pool,
  input: { responseId: number; userId: number; patch: ResponsePatch; at?: number },
): Promise<ResponseResult<ResponseDetail>> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query("SELECT * FROM procurement_responses WHERE id = ? FOR UPDATE", [input.responseId]);
    const row = (rows as ResponseRow[])[0];
    if (!row) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }
    if (!(await canAccess(db, row, input.userId))) {
      await conn.rollback();
      return { ok: false, reason: "forbidden" };
    }
    if (row.status !== RESPONSE_STATUS.DRAFT) {
      await conn.rollback();
      return { ok: false, reason: "state_invalid" };
    }
    const tender = await loadLatestTender(db, row.project_id);
    if (!tender || tender.status !== TENDER_STATUS.PUBLISHED || hasPassed(tender.deadline_at, at)) {
      await conn.rollback();
      return { ok: false, reason: "closed" };
    }

    const p = input.patch;
    await conn.query(
      `UPDATE procurement_responses
          SET currency = COALESCE(?, currency),
              incoterm = ?,
              incoterm_place = ?,
              validity_days = ?,
              lead_time_days = ?,
              tax_included = COALESCE(?, tax_included),
              remark = ?,
              updated_at = ?
        WHERE id = ?`,
      [
        p.currency ?? null,
        p.incoterm ?? null,
        p.incotermPlace ?? null,
        p.validityDays ?? null,
        p.leadTimeDays ?? null,
        p.taxIncluded == null ? null : p.taxIncluded ? 1 : 0,
        p.remark ?? null,
        at,
        row.id,
      ],
    );

    if (p.items) {
      await conn.query("DELETE FROM procurement_response_items WHERE response_id = ?", [row.id]);
      const items = p.items.slice(0, 200);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        await conn.query(
          `INSERT INTO procurement_response_items
             (response_id, item_id, lot_id, seq, unit_price, quantity, uom, lead_time_days,
              moq, brand_model, compliance, remark, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id,
            it.itemId ?? null,
            it.lotId ?? null,
            i,
            it.unitPrice == null ? null : String(it.unitPrice),
            it.quantity == null ? null : String(it.quantity),
            it.uom ?? null,
            it.leadTimeDays ?? null,
            it.moq == null ? null : String(it.moq),
            it.brandModel ?? null,
            it.compliance == null ? null : JSON.stringify(it.compliance),
            it.remark ?? null,
            at,
            at,
          ],
        );
      }
    }

    await conn.commit();
    const items = await loadItems(db, row.id);
    const files = await loadFiles(db, row.id);
    const fresh = (await loadResponseRow(db, row.id))!;
    return { ok: true, response: fresh, items, files, total: sumTotal(items), currency: fresh.currency };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export interface SubmitResult {
  responseId: number;
  status: string;
  receiptNo: string;
  receiptHash: string;
  submittedAt: number;
  duplicate?: boolean;
}

/**
 * 提交（密封）：生成回执并锁定内容。重复提交幂等——已提交时原样返回首次回执。
 * 校验：草稿或已撤回、标讯仍开放、未过截止、至少一条带单价的明细。
 */
export async function submitResponse(
  db: Pool,
  input: { responseId: number; userId: number; clientIp?: string | null; userAgent?: string | null; at?: number },
): Promise<ResponseResult<SubmitResult>> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query("SELECT * FROM procurement_responses WHERE id = ? FOR UPDATE", [input.responseId]);
    const row = (rows as ResponseRow[])[0];
    if (!row) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }
    if (!(await canAccess(db, row, input.userId))) {
      await conn.rollback();
      return { ok: false, reason: "forbidden" };
    }
    if (row.status === RESPONSE_STATUS.SUBMITTED && row.receipt_no && row.receipt_hash) {
      await conn.rollback();
      return {
        ok: true,
        responseId: row.id,
        status: row.status,
        receiptNo: row.receipt_no,
        receiptHash: row.receipt_hash,
        submittedAt: Number(row.submitted_at ?? at),
        duplicate: true,
      };
    }
    const allowed = RESPONSE_TRANSITIONS[String(row.status)] ?? [];
    if (!allowed.includes(RESPONSE_STATUS.SUBMITTED)) {
      await conn.rollback();
      return { ok: false, reason: "state_invalid" };
    }

    const tender = await loadLatestTender(db, row.project_id);
    if (!tender || tender.status !== TENDER_STATUS.PUBLISHED || hasPassed(tender.deadline_at, at)) {
      await conn.rollback();
      return { ok: false, reason: "closed" };
    }

    const items = await loadItems(db, row.id);
    if (items.length === 0 || !items.some((it) => it.unit_price != null && Number(it.unit_price) > 0)) {
      await conn.rollback();
      return { ok: false, reason: "no_items" };
    }
    const files = await loadFiles(db, row.id);
    const receiptHash = computeReceiptHash({
      projectId: Number(row.project_id),
      versionNo: Number(row.version_no),
      tenderId: Number(row.tender_id),
      supplierId: Number(row.supplier_id),
      items,
      files,
      submittedAt: at,
    });
    const receiptNo = row.receipt_no ?? formatReceiptNo(Number(row.id), at);
    await conn.query(
      `UPDATE procurement_responses
          SET status = 'submitted', submitted_at = ?, receipt_no = ?, receipt_hash = ?,
              sealed_until = COALESCE(?, sealed_until), client_ip = ?, user_agent = ?, updated_at = ?
        WHERE id = ?`,
      [at, receiptNo, receiptHash, tender.deadline_at, input.clientIp ?? null, input.userAgent ?? null, at, row.id],
    );
    await conn.query(
      `INSERT INTO procurement_events
         (project_id, version_no, tender_id, response_id, actor_type, actor_id, kind, payload, created_at)
       VALUES (?, ?, ?, ?, 'supplier', ?, 'response_submitted', ?, ?)`,
      [
        row.project_id,
        row.version_no,
        row.tender_id,
        row.id,
        input.userId,
        JSON.stringify({ receiptNo, receiptHash, itemCount: items.length, fileCount: files.length }),
        at,
      ],
    );
    await conn.commit();

    // 通知采购方（best-effort，失败不影响已提交事实）
    try {
      const [buyerRows] = await db.query(
        `SELECT b.user_id, p.reference
           FROM procurement_projects p JOIN procurement_buyers b ON b.id = p.buyer_id
          WHERE p.id = ? LIMIT 1`,
        [row.project_id],
      );
      const buyer = (buyerRows as Array<{ user_id: number | null; reference: string }>)[0];
      if (buyer?.user_id) {
        const { pushNotificationSafe } = await import("@/lib/services/notifications");
        await pushNotificationSafe(db, {
          userId: Number(buyer.user_id),
          type: "procurement.response_received",
          title: "",
          link: `/rfq/${row.project_id}/publish`,
          refId: Number(row.project_id),
          payload: { reference: buyer.reference, projectId: Number(row.project_id), responseId: Number(row.id) },
          dedupeKey: `procurement.response:${row.project_id}:v${row.version_no}:${row.id}`,
        });
      }
    } catch (err) {
      console.warn("[procurement] 收到响应通知写入失败:", (err as Error).message);
    }

    return {
      ok: true,
      responseId: Number(row.id),
      status: RESPONSE_STATUS.SUBMITTED,
      receiptNo,
      receiptHash,
      submittedAt: at,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** 截止前撤回（保留行，可重新提交） */
export async function withdrawResponse(
  db: Pool,
  input: { responseId: number; userId: number; reason?: string | null; at?: number },
): Promise<ResponseResult<{ status: string }>> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query("SELECT * FROM procurement_responses WHERE id = ? FOR UPDATE", [input.responseId]);
    const row = (rows as ResponseRow[])[0];
    if (!row) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }
    if (!(await canAccess(db, row, input.userId))) {
      await conn.rollback();
      return { ok: false, reason: "forbidden" };
    }
    const allowed = RESPONSE_TRANSITIONS[String(row.status)] ?? [];
    if (!allowed.includes(RESPONSE_STATUS.WITHDRAWN)) {
      await conn.rollback();
      return { ok: false, reason: "state_invalid" };
    }
    const tender = await loadLatestTender(db, row.project_id);
    if (!tender || hasPassed(tender.deadline_at, at)) {
      await conn.rollback();
      return { ok: false, reason: "closed" };
    }
    await conn.query(
      "UPDATE procurement_responses SET status = 'withdrawn', withdrawn_at = ?, updated_at = ? WHERE id = ?",
      [at, at, row.id],
    );
    await conn.query(
      `INSERT INTO procurement_events
         (project_id, version_no, tender_id, response_id, actor_type, actor_id, kind, payload, created_at)
       VALUES (?, ?, ?, ?, 'supplier', ?, 'response_withdrawn', ?, ?)`,
      [row.project_id, row.version_no, row.tender_id, row.id, input.userId, JSON.stringify({ reason: input.reason ?? null }), at],
    );
    await conn.commit();
    return { ok: true, status: RESPONSE_STATUS.WITHDRAWN };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export interface BuyerResponseSummary {
  opened: boolean;
  count: number;
  items: Array<{
    responseId: number;
    supplierId: number;
    company: string;
    status: string;
    total: string | null;
    currency: string | null;
    submittedAt: number | null;
  }>;
}

/**
 * 采购方视角的响应列表。
 * 密封期只回份数（不泄露供应商名）；开标后回明细摘要。
 */
export async function listResponsesForBuyer(
  db: Pool,
  input: { projectId: number; buyerUserId: number; at?: number },
): Promise<ResponseResult<BuyerResponseSummary>> {
  const [ownRows] = await db.query(
    `SELECT p.id, p.version_no FROM procurement_projects p
       JOIN procurement_buyers b ON b.id = p.buyer_id
      WHERE p.id = ? AND b.user_id = ? LIMIT 1`,
    [input.projectId, input.buyerUserId],
  );
  const project = (ownRows as Array<{ id: number; version_no: number }>)[0];
  if (!project) return { ok: false, reason: "forbidden" };

  const tender = await loadLatestTender(db, input.projectId);
  if (!tender) return { ok: false, reason: "not_found" };

  const opened = tender.status !== TENDER_STATUS.PUBLISHED || tender.opened_at != null;
  if (!opened) {
    const [cntRows] = await db.query(
      "SELECT COUNT(*) AS c FROM procurement_responses WHERE project_id = ? AND version_no = ? AND status = 'submitted'",
      [input.projectId, project.version_no],
    );
    return { ok: true, opened: false, count: Number((cntRows as Array<{ c: number }>)[0]?.c ?? 0), items: [] };
  }

  const [rows] = await db.query(
    `SELECT r.id, r.supplier_id, r.status, r.currency, r.submitted_at, s.company,
            (SELECT COALESCE(SUM(ri.unit_price * ri.quantity), 0)
               FROM procurement_response_items ri WHERE ri.response_id = r.id) AS total
       FROM procurement_responses r
       JOIN supplier s ON s.id = r.supplier_id
      WHERE r.project_id = ? AND r.version_no = ? AND r.status IN ('submitted','evaluated','disqualified')
      ORDER BY r.submitted_at, r.id`,
    [input.projectId, project.version_no],
  );
  return {
    ok: true,
    opened: true,
    count: (rows as RowDataPacket[]).length,
    items: (rows as Array<Record<string, unknown>>).map((r) => ({
      responseId: Number(r.id),
      supplierId: Number(r.supplier_id),
      company: String(r.company ?? ""),
      status: String(r.status),
      total: r.total == null ? null : Number(r.total).toFixed(2),
      currency: r.currency == null ? null : String(r.currency),
      submittedAt: r.submitted_at == null ? null : Number(r.submitted_at),
    })),
  };
}

export interface CompareItemOffer {
  supplierId: number;
  company: string;
  unitPrice: string | null;
  leadTimeDays: number | null;
  brandModel: string | null;
  remark: string | null;
}

export interface CompareMatrix {
  tender: { id: number; deadlineAt: number | null; openedAt: number | null; awardMethod: string; sealed: boolean };
  items: Array<{
    itemId: number | null;
    lotId: number | null;
    name: string;
    spec: string | null;
    quantity: string | null;
    unit: string | null;
    offers: CompareItemOffer[];
  }>;
  totals: Array<{ responseId: number; supplierId: number; company: string; total: string | null; currency: string | null }>;
}

/** 比价矩阵：仅开标后可读；按项目明细顺序展开，给出每家每行报价与总价 */
export async function compareResponses(
  db: Pool,
  input: { projectId: number; buyerUserId: number },
): Promise<ResponseResult<CompareMatrix>> {
  const list = await listResponsesForBuyer(db, input);
  if (!list.ok) return list;
  if (!list.opened) return { ok: false, reason: "tender_not_open" };

  const tender = await loadLatestTender(db, input.projectId);
  if (!tender) return { ok: false, reason: "not_found" };

  const [itemRows] = await db.query(
    `SELECT id, lot_id, name_zh, name_en, spec, quantity, qty_unit, line_no
       FROM procurement_items WHERE project_id = ? ORDER BY lot_id, line_no, id`,
    [input.projectId],
  );
  const items = itemRows as Array<{
    id: number;
    lot_id: number | null;
    name_zh: string;
    name_en: string | null;
    spec: string | null;
    quantity: string | null;
    qty_unit: string | null;
    line_no: number;
  }>;

  const responseIds = list.items.map((r) => r.responseId);
  const offersByItem = new Map<string, CompareItemOffer[]>();
  if (responseIds.length > 0) {
    const [offerRows] = await db.query(
      `SELECT ri.item_id, ri.lot_id, ri.unit_price, ri.lead_time_days, ri.brand_model, ri.remark,
              r.id AS response_id, r.supplier_id, s.company
         FROM procurement_response_items ri
         JOIN procurement_responses r ON r.id = ri.response_id
         JOIN supplier s ON s.id = r.supplier_id
        WHERE ri.response_id IN (?)
        ORDER BY r.id`,
      [responseIds],
    );
    for (const row of offerRows as Array<Record<string, unknown>>) {
      const key = `${row.item_id == null ? "" : Number(row.item_id)}|${row.lot_id == null ? "" : Number(row.lot_id)}`;
      const listForItem = offersByItem.get(key) ?? [];
      listForItem.push({
        supplierId: Number(row.supplier_id),
        company: String(row.company ?? ""),
        unitPrice: row.unit_price == null ? null : String(row.unit_price),
        leadTimeDays: row.lead_time_days == null ? null : Number(row.lead_time_days),
        brandModel: row.brand_model == null ? null : String(row.brand_model),
        remark: row.remark == null ? null : String(row.remark),
      });
      offersByItem.set(key, listForItem);
    }
  }

  return {
    ok: true,
    tender: {
      id: Number(tender.id),
      deadlineAt: tender.deadline_at == null ? null : Number(tender.deadline_at),
      openedAt: tender.opened_at == null ? null : Number(tender.opened_at),
      awardMethod: String(tender.award_method),
      sealed: Number(tender.sealed) === 1,
    },
    items: items.map((it) => ({
      itemId: Number(it.id),
      lotId: it.lot_id == null ? null : Number(it.lot_id),
      name: String(it.name_zh || it.name_en || ""),
      spec: it.spec,
      quantity: it.quantity == null ? null : String(it.quantity),
      unit: it.qty_unit,
      offers: offersByItem.get(`${Number(it.id)}|${it.lot_id == null ? "" : Number(it.lot_id)}`) ?? [],
    })),
    totals: list.items.map((r) => ({
      responseId: r.responseId,
      supplierId: r.supplierId,
      company: r.company,
      total: r.total,
      currency: r.currency,
    })),
  };
}

/** 响应附件：上传字节入库（与需求附件同一 upload_files 表，文件名 attach_ 前缀可被既有下载路由识别） */
export async function addResponseFile(
  db: Pool,
  input: {
    responseId: number;
    userId: number;
    fileName: string;
    contentType: string;
    buffer: Buffer;
    envelope?: string;
    docKind?: string;
    at?: number;
  },
): Promise<{ ok: true; file: ResponseFileRow } | { ok: false; reason: "not_found" | "forbidden" | "closed" | "state_invalid" | "bad_type" | "too_large" }> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const row = await loadResponseRow(db, input.responseId);
  if (!row) return { ok: false, reason: "not_found" };
  if (!(await canAccess(db, row, input.userId))) return { ok: false, reason: "forbidden" };
  if (row.status !== RESPONSE_STATUS.DRAFT) return { ok: false, reason: "state_invalid" };
  const tender = await loadLatestTender(db, row.project_id);
  if (!tender || tender.status !== TENDER_STATUS.PUBLISHED || hasPassed(tender.deadline_at, at)) {
    return { ok: false, reason: "closed" };
  }
  if (input.buffer.length > 20 * 1024 * 1024) return { ok: false, reason: "too_large" };

  const ext = EXT_BY_CONTENT_TYPE[input.contentType];
  if (!ext) return { ok: false, reason: "bad_type" };

  const fileKey = `attach_${row.project_id}_resp${row.id}u${input.userId}_${at}.${ext}`;
  const { saveProcurementFile } = await import("@/lib/services/file-upload");
  await saveProcurementFile({ filename: fileKey, buffer: input.buffer, contentType: input.contentType, uploadedBy: input.userId });

  const hash = createHash("sha256").update(input.buffer).digest("hex");
  const [ins] = await db.query<ResultSetHeader>(
    `INSERT INTO procurement_response_files
       (response_id, envelope, doc_kind, file_key, file_name, file_hash, file_size, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      String(input.envelope ?? "technical").slice(0, 16),
      String(input.docKind ?? "attachment").slice(0, 32),
      fileKey,
      input.fileName.slice(0, 255),
      hash,
      input.buffer.length,
      at,
    ],
  );
  const [rows] = await db.query(
    `SELECT id, response_id, envelope, doc_kind, file_key, file_name, file_hash, file_size, created_at
       FROM procurement_response_files WHERE id = ? LIMIT 1`,
    [Number(ins.insertId)],
  );
  return { ok: true, file: (rows as ResponseFileRow[])[0] };
}

/** 删除响应附件（仅草稿期） */
export async function deleteResponseFile(
  db: Pool,
  input: { responseId: number; fileId: number; userId: number },
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "forbidden" | "state_invalid" }> {
  const row = await loadResponseRow(db, input.responseId);
  if (!row) return { ok: false, reason: "not_found" };
  if (!(await canAccess(db, row, input.userId))) return { ok: false, reason: "forbidden" };
  if (row.status !== RESPONSE_STATUS.DRAFT) return { ok: false, reason: "state_invalid" };
  const [res] = await db.query<ResultSetHeader>(
    "DELETE FROM procurement_response_files WHERE id = ? AND response_id = ?",
    [input.fileId, row.id],
  );
  if (Number(res.affectedRows ?? 0) === 0) return { ok: false, reason: "not_found" };
  return { ok: true };
}

/** 扩展名白名单（与需求附件保持一致） */
const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/zip": "zip",
};

/** 项目对某个登录用户是否已开标（前端决定是否展示比价入口） */
export async function isTenderOpened(db: Pool, projectId: number): Promise<boolean> {
  const tender = await loadLatestTender(db, projectId);
  return !!tender && (tender.status !== TENDER_STATUS.PUBLISHED || tender.opened_at != null);
}

/** 供定标/到期任务复用：项目行（含 method） */
export async function loadProjectRow(db: Pool, projectId: number): Promise<ProjectRow | null> {
  const [rows] = await db.query("SELECT * FROM procurement_projects WHERE id = ? LIMIT 1", [projectId]);
  return ((rows as ProjectRow[])[0] ?? null) || null;
}