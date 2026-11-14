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
