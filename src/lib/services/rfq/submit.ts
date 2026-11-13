/**
 * RFQ 提交审核
 * @module lib/services/rfq/submit
 *
 * @description 一次提交要原子完成四件事，缺一件就会出现重构前的老问题：
 *              1. **冻结版本**：生成 `rfq_demand_revision` 快照（审核依据），并把 `revision_no` +1；
 *              2. **生成工单**：`rfq_review_task` 入队，同时把上一版未处理的工单标记 `obsolete`
 *                 （否则用户改稿后，审核方还在审旧版）；
 *              3. **转移状态**：draft/rejected → submitted（经 lifecycle 单写入口，带事件）；
 *              4. **幂等**：重复点击不产生第二份工单，直接返回已提交。
 */
import { createHash } from "node:crypto";
import type { Pool } from "mysql2/promise";
import { DEMAND_ACTOR, DEMAND_STATUS, REVIEW_SLA_HOURS } from "@/shared/constants/rfq-demand";
import { transitionDemandWithin, type TxLike } from "./lifecycle";
import { validateDemandDraft, type FieldError } from "./validate";

export interface SubmitDemandInput {
  demandId: number;
  buyerUserId: number;
  at?: number;
}

export type SubmitDemandResult =
  | { ok: true; status: string; version: number; already?: boolean }
  | { ok: false; reason: "not_found" | "forbidden" | "not_editable" | "invalid"; errors?: FieldError[] };

interface DemandRow {
  id: number;
  buyer_user_id: number;
  status: string;
  revision_no: number;
  title: string;
  description: string | null;
  category_code: string | null;
  province_name: string | null;
  quantity: string | number | null;
  quantity_unit: string | null;
  purchase_type: string | null;
  budget_amount: string | number | null;
  budget_currency: string;
  budget_confidential: number;
  incoterm: string | null;
  delivery_time: string | null;
  delivery_address: string | null;
  payment_terms: string | null;
  supplier_reqs: string | null;
  visibility: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  terms_version: string | null;
  agreed_at: number | null;
  close_at: number | null;
  open_at: number | null;
}

/** 快照字段：只放"审核需要看到的内容"，不含内部状态与投影 id */
function buildSnapshot(row: DemandRow) {
  return {
    title: row.title,
    description: row.description,
    categoryCode: row.category_code,
    provinceName: row.province_name,
    purchaseType: row.purchase_type,
    quantity: row.quantity == null ? null : Number(row.quantity),
    quantityUnit: row.quantity_unit,
    budgetAmount: row.budget_amount == null ? null : Number(row.budget_amount),
    budgetCurrency: row.budget_currency,
    budgetConfidential: Number(row.budget_confidential) === 1,
    incoterm: row.incoterm,
    deliveryTime: row.delivery_time,
    deliveryAddress: row.delivery_address,
    paymentTerms: row.payment_terms,
    supplierReqs: row.supplier_reqs,
    visibility: row.visibility,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    termsVersion: row.terms_version,
    agreedAt: row.agreed_at,
    closeAt: row.close_at,
  };
}

export async function submitDemand(
  db: Pool,
  input: SubmitDemandInput,
): Promise<SubmitDemandResult> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      "SELECT * FROM rfq_demand WHERE id = ? FOR UPDATE",
      [input.demandId],
    );
    const row = (rows as DemandRow[])[0];
    if (!row) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }
    if (Number(row.buyer_user_id) !== input.buyerUserId) {
      await conn.rollback();
      return { ok: false, reason: "forbidden" };
    }

    const status = String(row.status);
    // 幂等：已在审核流程中，直接返回当前状态，不再生成第二份工单
    if (status === DEMAND_STATUS.SUBMITTED || status === DEMAND_STATUS.UNDER_REVIEW) {
      await conn.rollback();
      return { ok: true, status, version: Number(row.revision_no), already: true };
    }
    if (status !== DEMAND_STATUS.DRAFT && status !== DEMAND_STATUS.REJECTED) {
      await conn.rollback();
      return { ok: false, reason: "not_editable" };
    }

    // 完整校验：草稿阶段允许不完整，提交必须合规
    const validation = validateDemandDraft(
      {
        title: row.title,
        description: row.description ?? "",
        categoryCode: row.category_code,
        closeAt: row.close_at == null ? null : Number(row.close_at),
        budgetAmount: row.budget_amount == null ? null : Number(row.budget_amount),
        budgetConfidential: Number(row.budget_confidential) === 1,
        contactName: row.contact_name,
        contactEmail: row.contact_email,
        contactPhone: row.contact_phone,
        incoterm: row.incoterm,
        deliveryTime: row.delivery_time,
        provinceName: row.province_name,
        quantity: row.quantity == null ? null : Number(row.quantity),
        quantityUnit: row.quantity_unit,
      },
      at,
    );
    if (!validation.ok) {
      await conn.rollback();
      return { ok: false, reason: "invalid", errors: validation.errors };
    }

    const snapshot = buildSnapshot(row);
    const snapshotJson = JSON.stringify(snapshot);
    const contentHash = createHash("sha256").update(snapshotJson).digest("hex");
    const version = Number(row.revision_no) + 1;

    await conn.query(
      `INSERT INTO rfq_demand_revision (demand_id, version, snapshot, content_hash, created_at, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [input.demandId, version, snapshotJson, contentHash, at, at],
    );

    await conn.query(
      "UPDATE rfq_demand SET revision_no = ?, updated_at = ? WHERE id = ?",
      [version, at, input.demandId],
    );

    // 上一版未处理的工单作废（改稿 = 新版本，旧版本的审核结论失去意义）
    await conn.query(
      "UPDATE rfq_review_task SET status = 'obsolete' WHERE demand_id = ? AND status IN ('queued','claimed')",
      [input.demandId],
    );

    await conn.query(
      `INSERT INTO rfq_review_task (demand_id, revision_no, status, sla_due_at, created_at)
       VALUES (?, ?, 'queued', ?, ?)`,
      [input.demandId, version, at + REVIEW_SLA_HOURS * 3600, at],
    );

    const transition = await transitionDemandWithin(conn as unknown as TxLike, {
      demandId: input.demandId,
      to: DEMAND_STATUS.SUBMITTED,
      actor: DEMAND_ACTOR.BUYER,
      actorId: input.buyerUserId,
      at,
    });
    if (!transition.ok) {
      // 理论上不会发生（状态已在上方校验），保险起见回滚并如实返回
      await conn.rollback();
      return { ok: false, reason: "not_editable" };
    }

    await conn.commit();
    return { ok: true, status: transition.status, version };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
