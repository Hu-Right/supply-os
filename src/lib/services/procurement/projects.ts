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
  usage_env: string | null;
  standards: string | null;
  incoterm_version: string | null;
  batch_delivery: number;
  batch_note: string | null;
  budget_amount: string | number | null;
  budget_currency: string;
  budget_public: number;
  budget_approved: string | null;
  delivery_country: string | null;
  delivery_city: string | null;
  delivery_province: string | null;
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
  "usage_env",
  "standards",
  "incoterm_version",
  "batch_delivery",
  "batch_note",
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

/**
 * 可编辑列的键索引：同时接受 snake_case（服务契约）与 camelCase（既有前端/外部调用）。
 * 2026-11-14 缺陷：向导按 camelCase 提交，updateProject 只遍历 snake 列名 →
 * 命中 0 列、静默返回 changed:0，标题/预算/交付/条款全部丢失。
 */
const PROJECT_COLUMN_BY_KEY: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const col of PROJECT_EDITABLE_COLUMNS) {
    map.set(col, col);
    map.set(col.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase()), col);
  }
  return map;
})();

/** 列表型字段（F02 多选口）：数组统一 join 成逗号串 */
const PROJECT_LIST_COLUMNS = new Set(["object_types", "install_needs", "guarantees"]);

/** 把任意键名的入参规范成「列名 → 值」；无法识别的键（状态/核验列等）一律丢弃 */
export function normalizeProjectFields(
  fields: Record<string, unknown>,
): Partial<Record<(typeof PROJECT_EDITABLE_COLUMNS)[number], unknown>> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields ?? {})) {
    const col = PROJECT_COLUMN_BY_KEY.get(key);
    if (!col || value === undefined) continue;
    out[col] = PROJECT_LIST_COLUMNS.has(col) && Array.isArray(value) ? value.join(",") : value;
  }
  return out as Partial<Record<(typeof PROJECT_EDITABLE_COLUMNS)[number], unknown>>;
}

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
    // title_zh 是 NOT NULL 且无默认值：严格 sql_mode 下必须显式给空串，
    // 否则 INSERT 直接 1364（草稿标题由后续 PATCH 补齐）。
    const [ins] = await conn.query(
      `INSERT INTO procurement_projects (buyer_id, reference, status, title_zh, purpose, created_at, updated_at)
       VALUES (?, 'PENDING', 'draft', '', 'real', ?, ?)`,
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
  /** 列名或 camelCase 键均可（内部经 normalizeProjectFields 归一） */
  fields: Record<string, unknown>;
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
  const fields = normalizeProjectFields(input.fields);
  for (const col of PROJECT_EDITABLE_COLUMNS) {
    if (fields[col] === undefined) continue;
    const raw = fields[col];
    sets.push(`\`${col}\` = ?`);
    // JSON 列：对象/数组先序列化（MySQL 不接受对象绑定）
    params.push(
      raw === ""
        ? null
        : col === "compliance" && raw !== null && typeof raw === "object"
          ? JSON.stringify(raw)
          : raw,
    );
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


// ── 列表/详情/广场/明细整包 ────────────────────────────────────────────────────

export async function listMine(
  db: Pool,
  userId: number,
  opts: { status?: string; page?: number; pageSize?: number } = {},
): Promise<{ items: ProjectRow[]; total: number }> {
  const page = Math.max(1, Number(opts.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(opts.pageSize ?? 20)));
  const conds = ["b.user_id = ?"];
  const params: unknown[] = [userId];
  if (opts.status) {
    conds.push("p.status = ?");
    params.push(opts.status);
  }
  const where = conds.join(" AND ");
  const [countRes] = await db.query(
    `SELECT COUNT(*) AS total FROM procurement_projects p JOIN procurement_buyers b ON b.id = p.buyer_id WHERE ${where}`,
    params,
  );
  const total = Number((countRes as Array<{ total: number }>)[0]?.total ?? 0);
  const [rows] = await db.query(
    `SELECT p.* FROM procurement_projects p JOIN procurement_buyers b ON b.id = p.buyer_id
      WHERE ${where} ORDER BY p.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  return { items: rows as ProjectRow[], total };
}

/** 公开广场：仅 published，按发布时间倒序；UGT 一级前缀过滤可选 */
export async function listPlaza(
  db: Pool,
  opts: { categoryL1?: string; keyword?: string; page?: number; pageSize?: number } = {},
): Promise<{ items: ProjectRow[]; total: number }> {
  const page = Math.max(1, Number(opts.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(opts.pageSize ?? 20)));
  const conds = ["p.status = 'published'"];
  const params: unknown[] = [];
  if (opts.categoryL1 && /^UGT-\d{2}$/.test(opts.categoryL1)) {
    conds.push("p.primary_ugt_code LIKE ?");
    params.push(`${opts.categoryL1}%`);
  }
  if (opts.keyword && String(opts.keyword).trim()) {
    conds.push("(p.title_zh LIKE ? OR p.title_en LIKE ? OR p.background LIKE ?)");
    const kw = `%${String(opts.keyword).trim()}%`;
    params.push(kw, kw, kw);
  }
  const where = conds.join(" AND ");
  const [countRes] = await db.query(
    `SELECT COUNT(*) AS total FROM procurement_projects p WHERE ${where}`,
    params,
  );
  const total = Number((countRes as Array<{ total: number }>)[0]?.total ?? 0);
  const [rows] = await db.query(
    `SELECT p.* FROM procurement_projects p WHERE ${where}
      ORDER BY p.published_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  return { items: rows as ProjectRow[], total };
}

export interface ItemInput {
  lotNo?: string | null;
  nameZh: string;
  nameEn?: string | null;
  spec?: string | null;
  quantity?: number | string | null;
  qtyUnit?: string | null;
  qtyType?: string | null;
  ugtCode?: string | null;
  attributes?: unknown;
  alternativesAllowed?: boolean;
}

export interface LotInput {
  lotNo: string;
  title: string;
  scopeNote?: string | null;
}

/**
 * 明细/标包整包替换（仅草稿/需补充态）：草稿期自由增删，提交后冻结。
 * line_no 按传入顺序重排。
 */
export async function replaceDraftItems(
  db: Pool,
  input: { projectId: number; lots: LotInput[]; items: ItemInput[] },
): Promise<{ ok: true; itemCount: number } | { ok: false; reason: "not_found" | "not_editable" }> {
  const at = Math.floor(Date.now() / 1000);
  const row = await getProjectById(db, input.projectId);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status !== PROJECT_STATUS.DRAFT && row.status !== PROJECT_STATUS.NEED_INFO) {
    return { ok: false, reason: "not_editable" };
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM procurement_items WHERE project_id = ?", [input.projectId]);
    await conn.query("DELETE FROM procurement_lots WHERE project_id = ?", [input.projectId]);

    const lotIds = new Map<string, number>();
    for (const lot of input.lots) {
      const [ins] = await conn.query(
        "INSERT INTO procurement_lots (project_id, lot_no, title, scope_note, created_at) VALUES (?, ?, ?, ?, ?)",
        [input.projectId, lot.lotNo, lot.title, lot.scopeNote ?? null, at],
      );
      lotIds.set(lot.lotNo, Number((ins as { insertId?: number }).insertId ?? 0));
    }

    let line = 0;
    for (const it of input.items) {
      line++;
      const lotId = it.lotNo ? (lotIds.get(it.lotNo) ?? null) : null;
      await conn.query(
        `INSERT INTO procurement_items
           (project_id, lot_id, line_no, name_zh, name_en, spec, quantity, qty_unit, qty_type, ugt_code, attributes, alternatives_allowed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.projectId,
          lotId,
          line,
          it.nameZh,
          it.nameEn ?? null,
          it.spec ?? null,
          it.quantity == null ? 0 : Number(it.quantity),
          it.qtyUnit || "件",
          it.qtyType || "fixed",
          it.ugtCode || null,
          it.attributes ? JSON.stringify(it.attributes) : null,
          it.alternativesAllowed === false ? 0 : 1,
          at,
        ],
      );
    }

    await conn.query("UPDATE procurement_projects SET updated_at = ? WHERE id = ?", [at, input.projectId]);
    await conn.commit();
    return { ok: true, itemCount: line };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * 复制历史采购单为新草稿（F02：复制历史采购单）。
 * 复制主表可编辑字段 + 标包 + 明细（附件不复制，避免重复占用字节库）。
 * 新单编号重新生成，状态 draft，版本归零；所有编辑/提交/签署/核验从零开始。
 */
export async function copyProjectAsDraft(
  db: Pool,
  input: { sourceProjectId: number; buyerId: number; at?: number },
): Promise<{ ok: true; projectId: number; reference: string } | { ok: false; reason: "not_found" }> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [srcRows] = await conn.query(
      "SELECT * FROM procurement_projects WHERE id = ? AND buyer_id = ? LIMIT 1",
      [input.sourceProjectId, input.buyerId],
    );
    const src = (srcRows as ProjectRow[])[0];
    if (!src) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }

    const [ins] = await conn.query(
      `INSERT INTO procurement_projects (buyer_id, reference, status, title_zh, created_at, updated_at)
       VALUES (?, 'PENDING', 'draft', '', ?, ?)`,
      [input.buyerId, at, at],
    );
    const projectId = Number((ins as { insertId?: number }).insertId ?? 0);
    const reference = formatProjectReference(projectId, at);

    const copyCols = ["title_zh", ...PROJECT_EDITABLE_COLUMNS.filter((c) => c !== "title_zh")];
    const sets = copyCols.map((c) => `\`${c}\` = ?`).join(", ");
    // JSON 列（compliance）在驱动侧可能已是对象，绑定前必须序列化
    const params = copyCols.map((c) => {
      const v = src[c as keyof ProjectRow] ?? null;
      return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
    });
    await conn.query(
      `UPDATE procurement_projects
          SET ${sets}, reference = ?, status = 'draft', version_no = 0,
              submitted_at = NULL, published_at = NULL, notice_pk = NULL,
              requirement_verify = 'pending', fund_verify = 'unverified', updated_at = ?
        WHERE id = ?`,
      [...params, reference, at, projectId],
    );

    await conn.query(
      "INSERT INTO procurement_lots (project_id, lot_no, title, scope_note, created_at) SELECT ?, lot_no, title, scope_note, ? FROM procurement_lots WHERE project_id = ?",
      [projectId, at, input.sourceProjectId],
    );
    await conn.query(
      `INSERT INTO procurement_items
         (project_id, lot_id, line_no, name_zh, name_en, spec, quantity, qty_unit, qty_type, ugt_code, attributes, alternatives_allowed, created_at)
       SELECT ?, nl.id, i.line_no, i.name_zh, i.name_en, i.spec, i.quantity, i.qty_unit, i.qty_type, i.ugt_code, i.attributes, i.alternatives_allowed, ?
         FROM procurement_items i
         LEFT JOIN procurement_lots ol ON ol.id = i.lot_id
         LEFT JOIN procurement_lots nl ON nl.project_id = ? AND nl.lot_no = ol.lot_no
        WHERE i.project_id = ?
        ORDER BY i.lot_id, i.line_no`,
      [projectId, at, projectId, input.sourceProjectId],
    );

    await conn.commit();
    return { ok: true, projectId, reference };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** 详情组装：主表+标包+明细+附件+核验记录（时间线）+授权状态 */export interface ProjectDetailBundle {
  project: ProjectRow;
  buyerOrgName: string;
  lots: RowDataPacket[];
  items: RowDataPacket[];
  attachments: RowDataPacket[];
  reviews: RowDataPacket[];
  authorization: {
    status: "none" | "pending" | "verified" | "rejected";
    signerName: string | null;
    signedAt: number | null;
  };
}

export async function getProjectBundle(db: Pool, projectId: number): Promise<ProjectDetailBundle | null> {
  const project = await getProjectById(db, projectId);
  if (!project) return null;
  const [buyerRows] = await db.query(
    "SELECT org_name FROM procurement_buyers WHERE id = ? LIMIT 1",
    [project.buyer_id],
  );
  const [lots] = await db.query("SELECT * FROM procurement_lots WHERE project_id = ? ORDER BY lot_no", [projectId]);
  const [items] = await db.query("SELECT * FROM procurement_items WHERE project_id = ? ORDER BY lot_id, line_no", [projectId]);
  const [attachments] = await db.query(
    "SELECT id, version_no, kind, filename, file_key, file_hash, size_bytes, uploaded_at FROM procurement_attachments WHERE project_id = ? ORDER BY id",
    [projectId],
  );
  const [reviews] = await db.query(
    "SELECT id, version_no, stage, result, reviewer, note, created_at FROM procurement_reviews WHERE project_id = ? ORDER BY id DESC LIMIT 50",
    [projectId],
  );
  const [authRows] = await db.query(
    "SELECT status, signer_name, signed_at FROM procurement_authorizations WHERE project_id = ? AND version_no = ? ORDER BY id DESC LIMIT 1",
    [projectId, project.version_no],
  );
  const authRec = (authRows as RowDataPacket[])[0];
  return {
    project,
    buyerOrgName: String((buyerRows as Array<{ org_name: string }>)[0]?.org_name ?? ""),
    lots: lots as RowDataPacket[],
    items: items as RowDataPacket[],
    attachments: attachments as RowDataPacket[],
    reviews: reviews as RowDataPacket[],
    authorization: {
      status: authRec ? (String(authRec.status) as "pending" | "verified" | "rejected") : "none",
      signerName: authRec ? String(authRec.signer_name ?? "") : null,
      signedAt: authRec ? Number(authRec.signed_at ?? 0) : null,
    },
  };
}
