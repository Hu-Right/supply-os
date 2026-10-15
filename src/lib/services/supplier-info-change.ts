/**
 * 供应商企业信息变更流水（普通字段留痕 + 例外字段先审后生效）
 * Supplier enterprise info change log
 *
 * @module lib/services/supplier-info-change
 * @description 已认证主体（verify_status='done'）改企业信息时，按字段分两类落 crm_supplier_info_changes：
 *              - 普通资料字段：新值即时写 supplier 正式列，本模块只记一条 status='logged' 的留痕
 *                （后台可抽查，不挡在架）；
 *              - 例外字段（法人 legal_rep / 资质认证 certification）：**先审后生效**——新值只登记为
 *                status='pending_review'、**不覆盖正式列**，旧值继续在架，后台「通过」才由审核端回写。
 *
 *              与 crm_license_changes（换照先审后生效）同一心智、同一张流水表的两种 status；
 *              审核端（approve/reject 回写）在后台项目 intelligence-daily，本模块只做门户侧的写与读。
 *              未认证主体（pending/rejected）的编辑属认证前流程，不走这套（整行都在审核中），由调用方判定。
 */
import { getPool } from "../db/pool";

/** 例外字段：已认证主体改这些走「先审后生效」，新值不即时生效 */
export const INFO_CHANGE_REVIEW_FIELDS = ["legal_rep", "certification"] as const;

export type InfoChangeStatus = "logged" | "pending_review" | "approved" | "rejected";

/** 编辑页展示的待复核变更 */
export interface PendingInfoChange {
  id: number;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string | null;
}

/** 值归一用于比对：非字符串转串、trim；null/undefined 归一为空串（区分「未填」由调用方在 diff 前处理） */
function norm(v: unknown): string {
  return String(v ?? "").trim();
}

/** 字段是否属于「先审后生效」例外集 */
export function isReviewField(field: string): boolean {
  return (INFO_CHANGE_REVIEW_FIELDS as readonly string[]).includes(field);
}

/**
 * 记一条即时生效字段的留痕（status='logged'）。
 * 留痕是审计旁路，失败不应影响主保存——调用方按需 catch 降级；本函数如实抛出。
 */
export async function recordInfoChange(params: {
  supplierId: number;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  actorUserId: number | null;
}): Promise<void> {
  const pool = getPool();
  await pool.execute(
    `INSERT INTO crm_supplier_info_changes (supplier_id, field, old_value, new_value, status, actor_user_id)
     VALUES (?, ?, ?, ?, 'logged', ?)`,
    [params.supplierId, params.field, params.oldValue, params.newValue, params.actorUserId],
  );
}

/**
 * 覆盖式登记某例外字段的待审变更：同一 (supplier, field) 只保留最新一条 pending_review
 * （新提交取代旧待审），再插一条新的。旧值取当前正式列值（由调用方传入，避免这里再查）。
 */
export async function upsertPendingInfoChange(params: {
  supplierId: number;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  actorUserId: number | null;
}): Promise<void> {
  const pool = getPool();
  await pool.execute(
    `DELETE FROM crm_supplier_info_changes WHERE supplier_id = ? AND field = ? AND status = 'pending_review'`,
    [params.supplierId, params.field],
  );
  await pool.execute(
    `INSERT INTO crm_supplier_info_changes (supplier_id, field, old_value, new_value, status, actor_user_id)
     VALUES (?, ?, ?, ?, 'pending_review', ?)`,
    [params.supplierId, params.field, params.oldValue, params.newValue, params.actorUserId],
  );
}

/** 读某供应商当前待复核的例外字段变更（编辑页展示「有 N 项待复核」及其新旧值） */
export async function listPendingInfoChanges(supplierId: number): Promise<PendingInfoChange[]> {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, field, old_value, new_value, created_at
       FROM crm_supplier_info_changes
      WHERE supplier_id = ? AND status = 'pending_review'
      ORDER BY id`,
    [supplierId],
  );
  return (rows as Array<Record<string, unknown>>).map((r) => ({
    id: Number(r.id),
    field: String(r.field),
    oldValue: r.old_value == null ? null : String(r.old_value),
    newValue: r.new_value == null ? null : String(r.new_value),
    createdAt: r.created_at
      ? r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at)
      : null,
  }));
}

/**
 * 把一次编辑的 body 按「例外字段先审后生效、普通字段即时生效+留痕」分流并落库。
 * 仅对已认证主体调用（调用方判定 state==='verified'）。
 * @returns pendingReviewCount 本次进入待复核的例外字段数（供返回体提示）
 */
export async function applyVerifiedInfoChanges(params: {
  supplierId: number;
  current: Record<string, unknown>;
  /** 已按 EDITABLE_COLUMNS 过滤后的输入（键=列名，值=新值或 null） */
  editableInput: Record<string, unknown>;
  actorUserId: number | null;
}): Promise<{ pendingReviewCount: number }> {
  const { supplierId, current, editableInput, actorUserId } = params;
  let pendingReviewCount = 0;
  for (const [field, nextRaw] of Object.entries(editableInput)) {
    const prev = norm(current[field]);
    const next = norm(nextRaw);
    // 「未提供」的键不会出现在 editableInput（pickEditable 只收在 input 里的列）；
    // 提供但值未变（trim 后相等）→ 不记、不动，避免无改动保存刷一堆留痕
    if (prev === next) continue;
    if (isReviewField(field)) {
      await upsertPendingInfoChange({
        supplierId,
        field,
        oldValue: current[field] == null ? null : String(current[field]),
        newValue: nextRaw == null ? null : String(nextRaw),
        actorUserId,
      });
      pendingReviewCount += 1;
    } else {
      await recordInfoChange({
        supplierId,
        field,
        oldValue: current[field] == null ? null : String(current[field]),
        newValue: nextRaw == null ? null : String(nextRaw),
        actorUserId,
      });
    }
  }
  return { pendingReviewCount };
}

/** 从编辑输入里剔除「例外字段」，得到可即时写正式列的子集（例外字段走待审，不覆盖正式列） */
export function splitOutReviewFields(editableInput: Record<string, unknown>): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const [field, v] of Object.entries(editableInput)) {
    if (isReviewField(field)) continue;
    rest[field] = v;
  }
  return rest;
}
