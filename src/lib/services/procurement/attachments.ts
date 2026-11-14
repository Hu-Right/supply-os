/**
 * 需求附件
 * @module lib/services/procurement/attachments
 *
 * @description 附件字节入库（复用 upload_files 通道，attachment_ 前缀白名单），
 *              记录落 procurement_attachments 并绑定版本（0=草稿期，提交时随版本冻结）。
 *              文件哈希落库——全案 F14「附件应有文件哈希值、上传人、上传时间及版本记录」。
 */
import { createHash } from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { saveProcurementFile } from "@/lib/services/file-upload";

const MAX_SIZE = 20 * 1024 * 1024; // 20MB（图纸/BOM 场景比执照宽松）

export const ALLOWED_ATTACHMENT_TYPES = [
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

export interface AttachmentRow extends RowDataPacket {
  id: number;
  project_id: number;
  version_no: number;
  kind: string;
  filename: string;
  file_key: string;
  file_hash: string;
  size_bytes: number;
  uploaded_by: number;
  uploaded_at: number;
}

export type AddAttachmentResult =
  | { ok: true; id: number; fileUrl: string }
  | { ok: false; reason: "bad_type" | "too_large" };

/** 添加需求附件（草稿期 version_no=0；提交时统一挂到确认版本） */
export async function addAttachment(
  db: Pool,
  input: {
    projectId: number;
    uploadedBy: number;
    filename: string;
    contentType: string;
    buffer: Buffer;
    kind?: string;
    at?: number;
  },
): Promise<AddAttachmentResult> {
  if (!ALLOWED_ATTACHMENT_TYPES.includes(input.contentType)) {
    return { ok: false, reason: "bad_type" };
  }
  if (input.buffer.length > MAX_SIZE) return { ok: false, reason: "too_large" };

  const at = input.at ?? Math.floor(Date.now() / 1000);
  const ext = input.filename.includes(".") ? input.filename.slice(input.filename.lastIndexOf(".") + 1).toLowerCase() : "bin";
  const fileHash = createHash("sha256").update(input.buffer).digest("hex");
  const { url, filename: fileKey } = await saveProcurementFile({
    filename: `attach_${input.projectId}_${input.uploadedBy}_${Date.now()}.${ext}`,
    buffer: input.buffer,
    contentType: input.contentType,
    uploadedBy: input.uploadedBy,
  });

  const [ins] = await db.query(
    `INSERT INTO procurement_attachments
       (project_id, version_no, kind, filename, file_key, file_hash, size_bytes, uploaded_by, uploaded_at)
     VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?)`,
    [input.projectId, input.kind || "requirement", input.filename, fileKey, fileHash, input.buffer.length, input.uploadedBy, at],
  );
  return { ok: true, id: Number((ins as { insertId?: number }).insertId ?? 0), fileUrl: url };
}

/** 列附件（按版本；version_no 缺省=全部） */
export async function listAttachments(db: Pool, projectId: number, versionNo?: number): Promise<AttachmentRow[]> {
  const sql =
    versionNo === undefined
      ? "SELECT * FROM procurement_attachments WHERE project_id = ? ORDER BY id"
      : "SELECT * FROM procurement_attachments WHERE project_id = ? AND version_no = ? ORDER BY id";
  const [rows] = await db.query(sql, versionNo === undefined ? [projectId] : [projectId, versionNo]);
  return rows as AttachmentRow[];
}

/** 删除草稿期附件（已冻结版本的附件不可删——历史留痕） */
export async function deleteDraftAttachment(db: Pool, projectId: number, attachmentId: number): Promise<boolean> {
  const [res] = await db.query(
    "DELETE FROM procurement_attachments WHERE id = ? AND project_id = ? AND version_no = 0",
    [attachmentId, projectId],
  );
  return Number((res as { affectedRows?: number }).affectedRows ?? 0) > 0;
}
