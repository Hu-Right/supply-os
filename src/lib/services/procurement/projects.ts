/**
 * 采购项目（F02 主表 + F03 明细）
 * @module lib/services/procurement/projects
 *
 * @description 需求填报的写路径：创建（编号即生成）、编辑（仅 draft/need_info）、
 *              提交（=确认最终版本：冻结 revision 快照 + version_no+1，流程第 3 步）、
 *              工作台列表、公开广场列表。明细（items）随主表编辑接口整包替换
 *              （草稿期自由增删，提交后冻结）。
 */
import { createHash } from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { PROJECT_STATUS, PROJECT_REF_PREFIX } from "@/shared/constants/procurement";
import { formatProjectReference } from "./reference";
import { transitionProjectWithin, type TxLike } from "./lifecycle";

export interface ProjectRow extends RowDataPacket {
  id: number;
  reference: string;
  buyer_id: number;
  version_no: number;
  status: string;
  close_reason: string | null;
  title_zh: string;
  title_en: string | null;
  background: string | null;
  purpose: string;
  internal_project_no: string | null;
  object_types: string;
  budget_amount: string | number | null;
  budget_currency: string;
  budget_public: number;
  budget_approved: string | null;
  delivery_country: string | null;
  delivery_city: string | null;
  delivery_address: string | null;
  deadline_date: string | null;
  install_needs: string | null;
  logistics_note: string | null;
  incoterm: string | null;
  payment_terms: string | null;
  guarantees: string | null;
  supplier_country_limit: string | null;
  manufacturer_only: number;
  supplier_quals: string | null;
  quote_deadline_at: number | null;
  supplier_confirm_date: string | null;
  contract_date: string | null;
  compliance: string | null;
  authorize_publish: number;
  contact_disclosure: string;
  procurement_mode: string;
  primary_ugt_code: string | null;
  requirement_verify: string;
  fund_verify: string;
  submitted_at: number | null;
  published_at: number | null;
  created_at: number;
  updated_at: number;
}

/** 主表可编辑列（创建/编辑共用；状态/核验/编号列不在此列） */
export const PROJECT_EDITABLE_COLUMNS = [
  "title_zh",
  "title_en",
  "background",
  "purpose",
  "internal_project_no",
  "object_types",
  "budget_amount",
  "budget_currency",
  "budget_public",
  "budget_approved",
  "delivery_country",
  "delivery_city",
  "delivery_address",
  "deadline_date",
  "install_needs",
  "logistics_note",
  "incoterm",
  "payment_terms",
  "guarantees",
  "supplier_country_limit",
  "manufacturer_only",
  "supplier_quals",
  "quote_deadline_at",
  "supplier_confirm_date",
  "contract_date",
  "compliance",
  "authorize_publish",
  "contact_disclosure",
] as const;

export async function getProjectById(db: Pool, projectId: number): Promise<ProjectRow | null> {
  const [rows] = await db.query("SELECT * FROM procurement_projects WHERE id = ? LIMIT 1", [projectId]);
  return ((rows as ProjectRow[])[0] ?? null) || null;
}

/** 归属校验：项目必须属于该账号的采购主体 */
export async function isProjectOwnedBy(db: Pool, projectId: number, userId: number): Promise<boolean> {
  const [rows] = await db.query(
    `SELECT p.id FROM procurement_projects p
      JOIN procurement_buyers b ON b.id = p.buyer_id
      WHERE p.id = ? AND b.user_id = ? LIMIT 1`,
    [projectId, userId],
  );
  return (rows as RowDataPacket[]).length > 0;
}

export interface CreateProjectInput {
  buyerId: number;
  at?: number;
}

/**
 * 创建需求草稿：编号立即生成（OSPR-{年}-{id}，先 PENDING 占位同事务回填，防并发撞号）。
 */
export async function createProject(db: Pool, input: CreateProjectInput): Promise<{ projectId: number; reference: string }> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [ins] = await conn.query(
      `INSERT INTO procurement_projects (buyer_id, reference, status, created_at, updated_at)
       VALUES (?, 'PENDING', 'draft', ?, ?)`,
      [input.buyerId, at, at],
    );
    const projectId = Number((ins as { insertId?: number }).insertId ?? 0);
    const reference = formatProjectReference(projectId, at);
    await conn.query("UPDATE procurement_projects SET reference = ? WHERE id = ?", [reference, projectId]);
    await conn.commit();
    return { projectId, reference };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export interface UpdateProjectInput {
  projectId: number;
  at?: number;
  fields: Partial<Record<(typeof PROJECT_EDITABLE_COLUMNS)[number], unknown>>;
}

/** 深度冻结哈希：主表可编辑列 + 明细 + 附件清单的 canonical JSON */
function snapshotHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

/**
 * 编辑需求（仅 draft / need_info；rejected 概念并入 need_info——云境要求补充后重提）。
 * PATCH 语义：只更新传入字段；空串一律转 NULL（防"只改一个字段把其他清空"以外的脏写）。
 * 返回 changed 字段数。
 */
export async function updateProject(
  db: Pool,
  input: UpdateProjectInput,
): Promise<{ ok: true; changed: number } | { ok: false; reason: "not_found" | "not_editable" }> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const row = await getProjectById(db, input.projectId);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status !== PROJECT_STATUS.DRAFT && row.status !== PROJECT_STATUS.NEED_INFO) {
    return { ok: false, reason: "not_editable" };
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  let changed = 0;
  for (const col of PROJECT_EDITABLE_COLUMNS) {
    if (input.fields[col] === undefined) continue;
    const raw = input.fields[col];
    sets.push(`\`${col}\` = ?`);
    params.push(raw === "" ? null : raw);
    changed++;
  }
  if (changed === 0) return { ok: true, changed: 0 };

  sets.push("updated_at = ?");
  params.push(at, input.projectId);
  await db.query(`UPDATE procurement_projects SET ${sets.join(", ")} WHERE id = ?`, params);
  return { ok: true, changed };
}

/**
 * 提交 = 确认最终版本（流程第 3 步）：冻结 revision 快照（主表+明细+附件清单）、
 * version_no+1、状态 draft/need_info → submitted（经状态机，同事务）。
 * 主品类快照：取第一条明细的 UGT 码（匹配/检索/投影用）。
 */
export async function submitProject(
  db: Pool,
  input: { projectId: number; confirmedBy: number; at?: number },
): Promise<
  | { ok: true; status: string; versionNo: number; reference: string }
  | { ok: false; reason: "not_found" | "not_editable" | "empty_items" }
> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query("SELECT * FROM procurement_projects WHERE id = ? FOR UPDATE", [input.projectId]);
    const row = (rows as ProjectRow[])[0];
    if (!row) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }
    if (row.status !== PROJECT_STATUS.DRAFT && row.status !== PROJECT_STATUS.NEED_INFO) {
      await conn.rollback();
      return { ok: false, reason: "not_editable" };
    }

    const [items] = await conn.query(
      "SELECT * FROM procurement_items WHERE project_id = ? ORDER BY lot_id, line_no",
      [input.projectId],
    );
    const itemList = items as RowDataPacket[];
    if (itemList.length === 0) {
      await conn.rollback();
      return { ok: false, reason: "empty_items" };
    }
    const [atts] = await conn.query(
      "SELECT filename, file_key, file_hash, kind FROM procurement_attachments WHERE project_id = ? AND version_no = 0",
      [input.projectId],
    );
    const [lots] = await conn.query(
      "SELECT lot_no, title, scope_note FROM procurement_lots WHERE project_id = ? ORDER BY lot_no",
      [input.projectId],
    );

    // 快照：主表可编辑字段（去状态/核验列）+ 明细 + 标包 + 附件清单
    const editable: Record<string, unknown> = {};
    for (const col of PROJECT_EDITABLE_COLUMNS) editable[col] = row[col] ?? null;
    const snapshot = {
      project: editable,
      lots: lots as RowDataPacket[],
      items: itemList,
      attachments: atts as RowDataPacket[],
    };
    const contentHash = snapshotHash(snapshot);
    const versionNo = Number(row.version_no) + 1;

    await conn.query(
      `INSERT INTO procurement_revisions (project_id, version_no, snapshot, content_hash, confirmed_by, confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [input.projectId, versionNo, JSON.stringify(snapshot), contentHash, input.confirmedBy, at],
    );

    // 附件从草稿态(0)挂到当前确认版本
    await conn.query(
      "UPDATE procurement_attachments SET version_no = ? WHERE project_id = ? AND version_no = 0",
      [versionNo, input.projectId],
    );

    // 主品类快照：第一条明细的 UGT 码
    const firstUgt = String((itemList[0] as { ugt_code?: string | null })?.ugt_code ?? "") || null;

    const transition = await transitionProjectWithin(conn as unknown as TxLike, {
      projectId: input.projectId,
      to: PROJECT_STATUS.SUBMITTED,
      actor: "buyer",
      actorId: input.confirmedBy,
      at,
      extraSets: {
        version_no: versionNo,
        primary_ugt_code: firstUgt,
        submitted_at: at,
      },
    });
    if (!transition.ok) {
      await conn.rollback();
      return { ok: false, reason: "not_editable" };
    }

    await conn.commit();
    return {
      ok: true,
      status: transition.status,
      versionNo,
      reference: String(row.reference || `${PROJECT_REF_PREFIX}`),
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

