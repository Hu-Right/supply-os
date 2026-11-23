/**
 * ITB 招标文件包（F10/F14）
 * @module lib/services/procurement/tender-documents
 *
 * @description 设计稿：docs/2026-11-20-采购方式体系与发布流程重设计.md §4.5/§5.3。
 *              草稿期：采购方上传 9 件套核心件与附加件（version_no=0，可删）；
 *              发布时（applyReviewDecision 事务内）：核心件齐备校验 → 全部挂确认版本并
 *              published=1 冻结（F14：发布后不可改，变更=重传新记录）；
 *              发布后：仅 qa_addendum 可追加（答疑补遗，公开），且须在答疑截止前
 *              （tender_configs.qa_deadline_at，44017）；核心件齐备性是 ITB 发布闸之一。
 *              文件字节复用 attach_ 通道（upload_files），哈希+上传人+版本留痕。
 */
import { createHash } from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { PROJECT_STATUS, ITB_CORE_DOC_KINDS, TENDER_DOC_KINDS } from "@/shared/constants/procurement";
import { saveProcurementFile } from "@/lib/services/file-upload";

const MAX_SIZE = 20 * 1024 * 1024; // 20MB，与需求附件同口径
const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
];

export interface TenderDocumentRow extends RowDataPacket {
  id: number;
  project_id: number;
  version_no: number;
  doc_kind: string;
  file_name: string;
  file_key: string;
  file_hash: string;
  file_size: number;
  visibility: string;
  published: number;
  uploaded_by: number;
  created_at: number;
}

export type TenderDocResult<T> =
  | ({ ok: true } & T)
  | {
      ok: false;
      reason:
        | "not_found"
        | "forbidden"
        | "not_editable"
        | "bad_type"
        | "too_large"
        | "kind_invalid"
        | "qa_closed"
        | "frozen";
    };

async function loadOwnedProject(
  db: Pool,
  projectId: number,
  buyerUserId: number,
): Promise<{ id: number; version_no: number; status: string; method: string } | null> {
  const [rows] = await db.query(
    `SELECT p.id, p.version_no, p.status, p.method FROM procurement_projects p
       JOIN procurement_buyers b ON b.id = p.buyer_id
      WHERE p.id = ? AND b.user_id = ? LIMIT 1`,
    [projectId, buyerUserId],
  );
  return ((rows as Array<{ id: number; version_no: number; status: string; method: string }>)[0] ?? null) || null;
}

/** 读答疑截止（tender_configs；发布后补遗闸用） */
async function getQaDeadline(db: Pool, projectId: number): Promise<number | null> {
  const [rows] = await db.query(
    "SELECT qa_deadline_at FROM procurement_tender_configs WHERE project_id = ? ORDER BY version_no DESC, id DESC LIMIT 1",
    [projectId],
  );
  const v = (rows as Array<{ qa_deadline_at: number | null }>)[0]?.qa_deadline_at;
  return v == null ? null : Number(v);
}

/** 上传招标文件（草稿期任意件套；发布后仅 qa_addendum 且答疑截止前） */
export async function addTenderDocument(
  db: Pool,
  input: {
    projectId: number;
    buyerUserId: number;
    docKind: string;
    filename: string;
    contentType: string;
    buffer: Buffer;
    visibility?: string;
    at?: number;
  },
): Promise<TenderDocResult<{ id: number; fileUrl: string }>> {
  if (!ALLOWED_TYPES.includes(input.contentType)) return { ok: false, reason: "bad_type" };
  if (input.buffer.length > MAX_SIZE) return { ok: false, reason: "too_large" };
  const docKind = String(input.docKind ?? "");
  if (!(TENDER_DOC_KINDS as readonly string[]).includes(docKind)) return { ok: false, reason: "kind_invalid" };
  const visibility = input.visibility === "respondents" ? "respondents" : "public";

  const at = input.at ?? Math.floor(Date.now() / 1000);
  const project = await loadOwnedProject(db, input.projectId, input.buyerUserId);
  if (!project) return { ok: false, reason: "not_found" };

  const published = project.status === PROJECT_STATUS.PUBLISHED;
  if (published) {
    // 发布后冻结：核心件不可改（变更=重传新记录）；仅答疑补遗可追加且须在截止前
    if (docKind !== "qa_addendum") return { ok: false, reason: "frozen" };
    const qaDeadline = await getQaDeadline(db, input.projectId);
    if (qaDeadline != null && qaDeadline > 0 && at > qaDeadline) {
      return { ok: false, reason: "qa_closed" };
    }
  } else if (project.status !== "draft" && project.status !== "need_info") {
    return { ok: false, reason: "not_editable" };
  }

  const ext = input.filename.includes(".") ? input.filename.slice(input.filename.lastIndexOf(".") + 1).toLowerCase() : "bin";
  const fileHash = createHash("sha256").update(input.buffer).digest("hex");
  const { url, filename: fileKey } = await saveProcurementFile({
    filename: `attach_${input.projectId}_${input.buyerUserId}_${Date.now()}.${ext}`,
    buffer: input.buffer,
    contentType: input.contentType,
    uploadedBy: input.buyerUserId,
  });

  const [ins] = await db.query(
    `INSERT INTO procurement_tender_documents
       (project_id, version_no, doc_kind, file_name, file_key, file_hash, file_size, visibility, published, uploaded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.projectId, published ? project.version_no : 0, docKind, input.filename, fileKey, fileHash, input.buffer.length, visibility, published ? 1 : 0, input.buyerUserId, at],
  );
  return { ok: true, id: Number((ins as { insertId?: number }).insertId ?? 0), fileUrl: url };
}

/** 列文件包（owner 全量；publicOnly 供公开面过滤已发布+public） */
export async function listTenderDocuments(
  db: Pool,
  projectId: number,
  opts: { publicOnly?: boolean } = {},
): Promise<TenderDocumentRow[]> {
  const sql = opts.publicOnly
    ? "SELECT * FROM procurement_tender_documents WHERE project_id = ? AND published = 1 AND visibility = 'public' ORDER BY created_at, id"
    : "SELECT * FROM procurement_tender_documents WHERE project_id = ? ORDER BY created_at, id";
  const [rows] = await db.query(sql, [projectId]);
  return rows as TenderDocumentRow[];
}

/** 删除草稿期文件（已冻结版本不可删——F14 留痕） */
export async function deleteDraftTenderDocument(
  db: Pool,
  projectId: number,
  buyerUserId: number,
  documentId: number,
): Promise<TenderDocResult<{ deleted: boolean }>> {
  const project = await loadOwnedProject(db, projectId, buyerUserId);
  if (!project) return { ok: false, reason: "not_found" };
  if (project.status === PROJECT_STATUS.PUBLISHED) return { ok: false, reason: "frozen" };
  const [res] = await db.query(
    "DELETE FROM procurement_tender_documents WHERE id = ? AND project_id = ? AND version_no = 0 AND published = 0",
    [documentId, projectId],
  );
  return { ok: true, deleted: Number((res as { affectedRows?: number }).affectedRows ?? 0) > 0 };
}

/**
 * ITB 发布闸：9 件套核心件全部在册（草稿或已挂版本均可——发布事务内在冻结前检查）。
 * 缺件返回缺失清单（给评审后台/采购方可行动文案）。
 */
export async function findMissingCoreDocuments(db: Pool, projectId: number): Promise<string[]> {
  const [rows] = await db.query(
    "SELECT DISTINCT doc_kind FROM procurement_tender_documents WHERE project_id = ?",
    [projectId],
  );
  const present = new Set((rows as Array<{ doc_kind: string }>).map((r) => String(r.doc_kind)));
  return ITB_CORE_DOC_KINDS.filter((k) => !present.has(k));
}

/**
 * 发布冻结（applyReviewDecision 事务内）：草稿件挂确认版本 + 全部置 published=1。
 * F14 冻结语义：之后修改 = 重传新记录（旧记录留痕）。
 */
export async function freezeTenderDocuments(
  conn: { query: Pool["query"] },
  projectId: number,
  versionNo: number,
  at: number,
): Promise<number> {
  const [res] = await conn.query(
    "UPDATE procurement_tender_documents SET version_no = ?, published = 1 WHERE project_id = ? AND version_no = 0 AND published = 0",
    [versionNo, projectId],
  );
  // 补遗类历史行保持原样（发布后再传的 qa_addendum 已带版本与 published=1）
  void at;
  return Number((res as { affectedRows?: number }).affectedRows ?? 0);
}
