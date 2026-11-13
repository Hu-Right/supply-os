/**
 * RFQ 编辑（草稿 / 审核退回后）
 * @module lib/services/rfq/update
 *
 * @description PATCH 语义：**只改请求里出现的字段**。旧实现把 budget / budget_confidential /
 *              currency 塞进同一个分支，导致 `{"currency":"USD"}` 会把预算写成 0 且不可恢复；
 *              这里按列逐字段合并，未出现的列一律不碰。
 *
 *              状态约束：只有 draft / rejected 可编辑；rejected 编辑后回到 draft
 *              （走 lifecycle 单写入口，留事件），避免"改完了还挂在被退回状态"。
 */
import type { Pool } from "mysql2/promise";
import { DEMAND_ACTOR, DEMAND_STATUS } from "@/shared/constants/rfq-demand";
import { transitionDemandWithin, type TxLike } from "./lifecycle";
import type { NormalizedDemandPatch } from "./payload";

export interface UpdateDemandInput {
  demandId: number;
  buyerUserId: number;
  patch: NormalizedDemandPatch;
  at?: number;
}

export type UpdateDemandResult =
  | { ok: true; status: string; changed: number }
  | { ok: false; reason: "not_found" | "forbidden" | "not_editable" | "invalid"; message?: string };

/** patch 键 → 表列 + 是否布尔化 */
const COLUMN_MAP: Record<keyof NormalizedDemandPatch, { column: string; bool?: boolean }> = {
  title: { column: "title" },
  description: { column: "description" },
  categoryCode: { column: "category_code" },
  provinceCode: { column: "province_code" },
  provinceName: { column: "province_name" },
  purchaseType: { column: "purchase_type" },
  quantity: { column: "quantity" },
  quantityUnit: { column: "quantity_unit" },
  budgetAmount: { column: "budget_amount" },
  budgetCurrency: { column: "budget_currency" },
  budgetConfidential: { column: "budget_confidential", bool: true },
  incoterm: { column: "incoterm" },
  deliveryTime: { column: "delivery_time" },
  deliveryAddress: { column: "delivery_address" },
  paymentTerms: { column: "payment_terms" },
  supplierReqs: { column: "supplier_reqs" },
  visibility: { column: "visibility" },
  contactName: { column: "contact_name" },
  contactEmail: { column: "contact_email" },
  contactPhone: { column: "contact_phone" },
  termsVersion: { column: "terms_version" },
  agreedAt: { column: "agreed_at" },
  closeAt: { column: "close_at" },
};

interface DemandStateRow {
  id: number;
  buyer_user_id: number;
  status: string;
}

export async function updateDemand(
  db: Pool,
  input: UpdateDemandInput,
): Promise<UpdateDemandResult> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const selected = (await conn.query(
      "SELECT id, buyer_user_id, status FROM rfq_demand WHERE id = ? FOR UPDATE",
      [input.demandId],
    )) as unknown as [DemandStateRow[]];
    const row = selected[0]?.[0];
    if (!row) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }
    if (Number(row.buyer_user_id) !== input.buyerUserId) {
      await conn.rollback();
      return { ok: false, reason: "forbidden" };
    }
    const status = String(row.status);
    if (status !== DEMAND_STATUS.DRAFT && status !== DEMAND_STATUS.REJECTED) {
      await conn.rollback();
      return { ok: false, reason: "not_editable" };
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, value] of Object.entries(input.patch) as Array<
      [keyof NormalizedDemandPatch, unknown]
    >) {
      if (value === undefined) continue;
      const meta = COLUMN_MAP[key];
      if (!meta) continue;
      sets.push(`${meta.column} = ?`);
      if (meta.bool) params.push(value ? 1 : 0);
      else params.push(value);
    }

    if (sets.length === 0) {
      await conn.rollback();
      return { ok: true, status, changed: 0 };
    }

    // 轻量守卫（完整校验在提交审核时做）
    if (typeof input.patch.title === "string" && input.patch.title.length === 0) {
      await conn.rollback();
      return { ok: false, reason: "invalid", message: "标题不能为空" };
    }
    if (input.patch.budgetAmount != null && Number(input.patch.budgetAmount) < 0) {
      await conn.rollback();
      return { ok: false, reason: "invalid", message: "预算金额不能为负数" };
    }
    if (input.patch.closeAt !== undefined && input.patch.closeAt !== null && Number(input.patch.closeAt) <= at) {
      await conn.rollback();
      return { ok: false, reason: "invalid", message: "截止时间必须晚于当前时间" };
    }

    sets.push("updated_at = ?");
    params.push(at, input.demandId);
    const [result] = (await conn.query(
      `UPDATE rfq_demand SET ${sets.join(", ")} WHERE id = ?`,
      params,
    )) as unknown as [{ affectedRows?: number }];

    // 退回态编辑后回到草稿，避免"改完了还挂在被退回状态"
    if (status === DEMAND_STATUS.REJECTED) {
      const transition = await transitionDemandWithin(conn as unknown as TxLike, {
        demandId: input.demandId,
        to: DEMAND_STATUS.DRAFT,
        actor: DEMAND_ACTOR.BUYER,
        actorId: input.buyerUserId,
        at,
      });
      if (!transition.ok) {
        await conn.rollback();
        return { ok: false, reason: "not_editable" };
      }
    }

    await conn.commit();
    return {
      ok: true,
      status: status === DEMAND_STATUS.REJECTED ? DEMAND_STATUS.DRAFT : status,
      changed: Number(result?.affectedRows ?? 0),
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
