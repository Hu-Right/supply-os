/**
 * 采购方主体（F01）
 * @module lib/services/procurement/buyers
 *
 * @description 一个平台账号对应一个采购主体。认证状态机：pending → verified/need_info/
 *              restricted，核验由云境在站外后台完成（核验记录落 procurement_buyer_verifications，
 *              门户只回写状态快照）。口径与全案 F01 一致：未认证主体可保存需求草稿、
 *              可提交，但**不能以"已核验真实采购"身份正式发布**——发布闸在 tender 侧校验
 *              buyer.status === 'verified'。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { BUYER_STATUS } from "@/shared/constants/procurement";

export interface BuyerRow extends RowDataPacket {
  id: number;
  user_id: number;
  org_name: string;
  org_type: string;
  buyer_role: string;
  country: string | null;
  address: string | null;
  reg_no: string | null;
  tax_no: string | null;
  website: string | null;
  official_email: string | null;
  official_phone: string | null;
  leader_name: string | null;
  leader_title: string | null;
  leader_phone: string | null;
  leader_email: string | null;
  deliver_country: string | null;
  deliver_city: string | null;
  fund_source: string | null;
  budget_status: string | null;
  external_rules: string | null;
  license_file_key: string | null;
  license_file_hash: string | null;
  agent_auth_file_key: string | null;
  agent_auth_file_hash: string | null;
  auth_contact_name: string | null;
  auth_contact_phone: string | null;
  auth_contact_email: string | null;
  procurement_experience: string | null;
  status: string;
  verified_by: string | null;
  verified_at: number | null;
  verify_note: string | null;
  created_at: number;
  updated_at: number;
}

/** 主体资料可编辑字段（状态/核验字段不在此列，由核验通道回写） */
const EDITABLE_COLUMNS = [
  "org_name",
  "org_type",
  "buyer_role",
  "country",
  "address",
  "reg_no",
  "tax_no",
  "website",
  "official_email",
  "official_phone",
  "leader_name",
  "leader_title",
  "leader_phone",
  "leader_email",
  "deliver_country",
  "deliver_city",
  "fund_source",
  "budget_status",
  "external_rules",
  "license_file_key",
  "license_file_hash",
  "agent_auth_file_key",
  "agent_auth_file_hash",
  "auth_contact_name",
  "auth_contact_phone",
  "auth_contact_email",
  "procurement_experience",
] as const;

export async function getBuyerByUserId(db: Pool, userId: number): Promise<BuyerRow | null> {
  const [rows] = await db.query("SELECT * FROM procurement_buyers WHERE user_id = ? LIMIT 1", [userId]);
  return ((rows as BuyerRow[])[0] ?? null) || null;
}

export async function getBuyerById(db: Pool, buyerId: number): Promise<BuyerRow | null> {
  const [rows] = await db.query("SELECT * FROM procurement_buyers WHERE id = ? LIMIT 1", [buyerId]);
  return ((rows as BuyerRow[])[0] ?? null) || null;
}

export interface UpsertBuyerInput {
  userId: number;
  at?: number;
  fields: Partial<Record<(typeof EDITABLE_COLUMNS)[number], unknown>>;
}

/**
 * 创建/更新采购主体（幂等 upsert：一个账号一个主体）。
 * 已核验主体修改关键字段（org_name/reg_no）后状态回落 pending（重新核验）。
 */
export async function upsertBuyer(
  db: Pool,
  input: UpsertBuyerInput,
): Promise<{ ok: true; buyerId: number; status: string }> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const fields = input.fields ?? {};
  const sets: string[] = [];
  const params: unknown[] = [];

  for (const col of EDITABLE_COLUMNS) {
    if (fields[col] === undefined) continue;
    sets.push(`\`${col}\` = ?`);
    params.push(fields[col] === "" ? null : fields[col]);
  }

  const existing = await getBuyerByUserId(db, input.userId);
  if (!existing) {
    const orgName = String(fields.org_name ?? "").trim();
    await db.query(
      `INSERT INTO procurement_buyers (user_id, org_name, status, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, ?)`,
      [input.userId, orgName, at, at],
    );
    const created = await getBuyerByUserId(db, input.userId);
    const buyerId = Number(created?.id ?? 0);
    if (sets.length > 0) {
      sets.push(`updated_at = ?`);
      params.push(at);
      await db.query(`UPDATE procurement_buyers SET ${sets.join(", ")} WHERE id = ?`, [...params, buyerId]);
    }
    return { ok: true, buyerId, status: BUYER_STATUS.PENDING };
  }

  const buyerId = Number(existing.id);
  // 关键身份字段变更 → 回落待审核（防"先核验后改名"绕过）
  const identityChanged =
    (fields.org_name !== undefined && String(fields.org_name) !== String(existing.org_name)) ||
    (fields.reg_no !== undefined && String(fields.reg_no ?? "") !== String(existing.reg_no ?? ""));
  const nextStatus =
    existing.status === BUYER_STATUS.VERIFIED && identityChanged ? BUYER_STATUS.PENDING : existing.status;

  if (sets.length > 0 || nextStatus !== existing.status) {
    const finalSets = [...sets, "status = ?", "updated_at = ?"];
    const finalParams = [...params, nextStatus, at, buyerId];
    await db.query(`UPDATE procurement_buyers SET ${finalSets.join(", ")} WHERE id = ?`, finalParams);
  }
  return { ok: true, buyerId, status: nextStatus };
}

/** 发布闸：主体必须已认证（verified）且未受限 */
export function isBuyerPublishable(buyer: Pick<BuyerRow, "status">): boolean {
  return String(buyer.status) === BUYER_STATUS.VERIFIED;
}

/** 按账号取主体 id（无主体返回 null）——创建项目的前置 */
export async function getBuyerIdByUserId(db: Pool, userId: number): Promise<number | null> {
  const [rows] = await db.query("SELECT id FROM procurement_buyers WHERE user_id = ? LIMIT 1", [userId]);
  const row = (rows as Array<{ id: number }>)[0];
  return row ? Number(row.id) : null;
}

// ── F05 主体核验留痕（站外后台 → 门户回调）────────────────────────────────────

export const BUYER_VERIFY_KIND = {
  IDENTITY: "identity", // 公司是否真实存在 / 发布人是否受权 / 执照
  AUTHORIZATION: "authorization", // 代理采购授权文件
  FUND: "fund", // 资金/预算支持
} as const;

export type BuyerVerifyKind = (typeof BUYER_VERIFY_KIND)[keyof typeof BUYER_VERIFY_KIND];

export interface BuyerVerificationRow extends RowDataPacket {
  id: number;
  buyer_id: number;
  kind: string;
  result: string;
  evidence_file_key: string | null;
  evidence_hash: string | null;
  reviewer: string;
  note: string | null;
  callback_id: string | null;
  created_at: number;
}

/** 核验结论 → 主体状态：pass→verified；need_info→need_info；reject→restricted（限制使用） */
export function buyerStatusForResult(result: string): string {
  if (result === "pass") return BUYER_STATUS.VERIFIED;
  if (result === "need_info") return BUYER_STATUS.NEED_INFO;
  return BUYER_STATUS.RESTRICTED;
}

export interface RecordBuyerVerificationInput {
  buyerId: number;
  kind: BuyerVerifyKind;
  result: "pass" | "need_info" | "reject";
  reviewer: string;
  note?: string | null;
  evidenceFileKey?: string | null;
  evidenceHash?: string | null;
  /** 回调幂等键（站外后台 X-Review-Request-Id；重复投递不重复写留痕） */
  callbackId?: string | null;
  at?: number;
}

export type RecordBuyerVerificationResult =
  | { ok: true; verificationId: number; status: string; duplicate?: boolean }
  | { ok: false; reason: "not_found" | "bad_input" };

/**
 * 写入一条主体核验留痕并回写主体状态快照（同事务）。
 * 幂等：同一 (buyer_id, callback_id) 重复投递只保留首条，返回 duplicate。
 */
export async function recordBuyerVerification(
  db: Pool,
  input: RecordBuyerVerificationInput,
): Promise<RecordBuyerVerificationResult> {
  if (!input.reviewer?.trim() || !input.result) return { ok: false, reason: "bad_input" };
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query("SELECT id FROM procurement_buyers WHERE id = ? FOR UPDATE", [input.buyerId]);
    if ((rows as RowDataPacket[]).length === 0) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }
    if (input.callbackId) {
      const [dup] = await conn.query(
        "SELECT id FROM procurement_buyer_verifications WHERE buyer_id = ? AND callback_id = ? LIMIT 1",
        [input.buyerId, input.callbackId],
      );
      if ((dup as RowDataPacket[]).length > 0) {
        const [cur] = await conn.query("SELECT status FROM procurement_buyers WHERE id = ? LIMIT 1", [input.buyerId]);
        await conn.rollback();
        return {
          ok: true,
          verificationId: Number((dup as Array<{ id: number }>)[0].id),
          status: String((cur as Array<{ status: string }>)[0]?.status ?? ""),
          duplicate: true,
        };
      }
    }

    const [ins] = await conn.execute(
      `INSERT INTO procurement_buyer_verifications
         (buyer_id, kind, result, evidence_file_key, evidence_hash, reviewer, note, callback_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.buyerId,
        input.kind,
        input.result,
        input.evidenceFileKey ?? null,
        input.evidenceHash ?? null,
        input.reviewer.trim().slice(0, 64),
        input.note?.trim().slice(0, 500) || null,
        input.callbackId?.slice(0, 64) ?? null,
        at,
      ],
    );

    const status = buyerStatusForResult(input.result);
    await conn.query(
      "UPDATE procurement_buyers SET status = ?, verified_by = ?, verified_at = ?, verify_note = ?, updated_at = ? WHERE id = ?",
      [status, input.reviewer.trim().slice(0, 64), at, input.note?.trim().slice(0, 500) || null, at, input.buyerId],
    );

    await conn.commit();
    return { ok: true, verificationId: Number((ins as { insertId?: number }).insertId ?? 0), status };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** 核验留痕（认证页展示，按时间倒序，最多 20 条） */
export async function listBuyerVerifications(db: Pool, buyerId: number): Promise<BuyerVerificationRow[]> {
  const [rows] = await db.query(
    `SELECT id, buyer_id, kind, result, evidence_file_key, evidence_hash, reviewer, note, callback_id, created_at
       FROM procurement_buyer_verifications
      WHERE buyer_id = ? ORDER BY id DESC LIMIT 20`,
    [buyerId],
  );
  return rows as BuyerVerificationRow[];
}
