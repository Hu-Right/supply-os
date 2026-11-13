/**
 * RFQ 创建（草稿）
 * @module lib/services/rfq/create
 *
 * @description 建单是一个原子动作：插入聚合根 → 生成可读编号 → 写 created 事件。
 *              重构前这三步是裸执行的（INSERT 后再 UPDATE 补编号、再 best-effort 登记哨兵），
 *              任一步失败会留下「无编号草稿」；现在同事务，失败整体回滚。
 *
 *              草稿允许字段不完整（保存草稿场景）；**完整校验发生在提交审核时**（submit.ts），
 *              这样"边填边存"与"提交即合规"两件事不会互相卡住。
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "mysql2/promise";
import { DEMAND_ACTOR, DEMAND_STATUS } from "@/shared/constants/rfq-demand";
import { appendDemandEvent } from "./events";
import { formatDemandReference } from "./reference";

export interface CreateDemandInput {
  buyerUserId: number;
  buyerOrgName?: string | null;
  title: string;
  description?: string | null;
  categoryCode?: string | null;
  provinceCode?: string | null;
  provinceName?: string | null;
  purchaseType?: string | null;
  quantity?: number | null;
  quantityUnit?: string | null;
  budgetAmount?: number | null;
  budgetCurrency?: string;
  budgetConfidential?: boolean;
  incoterm?: string | null;
  deliveryTime?: string | null;
  deliveryAddress?: string | null;
  paymentTerms?: string | null;
  supplierReqs?: string | null;
  visibility?: "public" | "targeted";
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  termsVersion?: string | null;
  agreedAt?: number | null;
  /** 报价截止（秒）；草稿可为空 */
  closeAt?: number | null;
  /** 秒级时间戳；缺省取当前时间（便于测试与回放） */
  at?: number;
}

export type CreateDemandResult =
  | { ok: true; id: number; reference: string }
  | { ok: false; reason: "invalid_title" };

const COLUMNS = [
  "reference",
  "buyer_user_id",
  "buyer_org_name",
  "status",
  "revision_no",
  "title",
  "category_code",
  "province_code",
  "province_name",
  "purchase_type",
  "quantity",
  "quantity_unit",
  "description",
  "budget_amount",
  "budget_currency",
  "budget_confidential",
  "incoterm",
  "delivery_time",
  "delivery_address",
  "payment_terms",
  "supplier_reqs",
  "visibility",
  "contact_name",
  "contact_email",
  "contact_phone",
  "terms_version",
  "agreed_at",
  "close_at",
  "created_at",
  "updated_at",
] as const;

/** 建草稿：同事务内 插入 → 回填编号 → 写事件 */
export async function createDemandDraft(
  db: Pool,
  input: CreateDemandInput,
): Promise<CreateDemandResult> {
  const now = input.at ?? Math.floor(Date.now() / 1000);
  const title = (input.title ?? "").trim().slice(0, 50);
  if (!title) return { ok: false, reason: "invalid_title" };

  // reference NOT NULL + UNIQUE：先落一个临时唯一值，拿到自增 id 后再换成可读编号
  const draftRef = `PENDING-${randomUUID()}`;
  const values = COLUMNS.map((c) => {
    switch (c) {
      case "reference": return draftRef;
      case "buyer_user_id": return input.buyerUserId;
      case "buyer_org_name": return input.buyerOrgName ?? null;
      case "status": return DEMAND_STATUS.DRAFT;
      case "revision_no": return 0;
      case "title": return title;
      case "category_code": return input.categoryCode ?? null;
      case "province_code": return input.provinceCode ?? null;
      case "province_name": return input.provinceName ?? null;
      case "purchase_type": return input.purchaseType ?? null;
      case "quantity": return input.quantity ?? null;
      case "quantity_unit": return input.quantityUnit ?? null;
      case "description": return input.description ?? null;
      case "budget_amount": return input.budgetAmount ?? null;
      case "budget_currency": return input.budgetCurrency ?? "CNY";
      case "budget_confidential": return input.budgetConfidential ? 1 : 0;
      case "incoterm": return input.incoterm ?? null;
      case "delivery_time": return input.deliveryTime ?? null;
      case "delivery_address": return input.deliveryAddress ?? null;
      case "payment_terms": return input.paymentTerms ?? null;
      case "supplier_reqs": return input.supplierReqs ?? null;
      case "visibility": return input.visibility === "targeted" ? "targeted" : "public";
      case "contact_name": return input.contactName ?? null;
      case "contact_email": return input.contactEmail ?? null;
      case "contact_phone": return input.contactPhone ?? null;
      case "terms_version": return input.termsVersion ?? null;
      case "agreed_at": return input.agreedAt ?? null;
      case "close_at": return input.closeAt ?? null;
      case "created_at": return now;
      case "updated_at": return now;
      default: return null;
    }
  });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO rfq_demand (${COLUMNS.join(", ")}) VALUES (${COLUMNS.map(() => "?").join(", ")})`,
      values,
    );
    const id = Number((result as { insertId?: number }).insertId ?? 0);
    if (!id) throw new Error("rfq_demand insert returned no id");

    const reference = formatDemandReference(id, now);
    await conn.query("UPDATE rfq_demand SET reference = ? WHERE id = ?", [reference, id]);

    await appendDemandEvent(conn as unknown as { query: (sql: string, params?: unknown[]) => Promise<unknown> }, {
      demandId: id,
      type: "created",
      actor: DEMAND_ACTOR.BUYER,
      actorId: input.buyerUserId,
      toStatus: DEMAND_STATUS.DRAFT,
      payload: { reference },
      at: now,
    });

    await conn.commit();
    return { ok: true, id, reference };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
