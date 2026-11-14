/**
 * 授权书签署与核验（流程第 4/5/6 步）
 * @module lib/services/procurement/authorization
 *
 * @description 签署 = 上传签字盖章扫描件 + 在线确认（一次动作）：身份/时间/IP/授权书内容
 *              哈希/扫描件哈希全部落 procurement_authorizations，状态 pending，由云境核验
 *              （verified/rejected）。版本绑定：versionNo 必须等于项目当前 version_no，
 *              letterHash 必须与当前版本授权书内容哈希一致——改稿重签自动失效。
 *              核验动作由站外评审后台直写库（ADR-0015 同库口径，与视图消费一致），
 *              门户不设核验端点。
 */
import { createHash } from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { AUTH_LETTER_TEMPLATE_VERSION, computeLetterHash } from "./authorization-letter";
import { saveProcurementScan } from "@/lib/services/file-upload";

const SCAN_MAX_SIZE = 10 * 1024 * 1024; // 10MB
const SCAN_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export interface AuthorizationRow extends RowDataPacket {
  id: number;
  project_id: number;
  version_no: number;
  letter_template_version: string;
  letter_hash: string;
  method: string;
  scan_file_key: string;
  scan_file_hash: string;
  signer_name: string;
  signer_uid: number;
  signed_at: number;
  confirm_ip: string | null;
  status: string;
  verified_by: string | null;
  verified_at: number | null;
  reject_reason: string | null;
}

export type SignAuthorizationResult =
  | { ok: true; id: number; fileUrl: string }
  | {
      ok: false;
      reason:
        | "not_found"
        | "forbidden"
        | "not_signable"
        | "version_conflict"
        | "letter_mismatch"
        | "bad_file"
        | "bad_signer";
    };

/**
 * 签署授权书（上传扫描件 + 在线确认）。
 * 可签署状态：submitted/under_review（版本已冻结到核验完成前）。
 */
export async function signAuthorization(
  db: Pool,
  input: {
    projectId: number;
    signerUid: number;
    signerName: string;
    letterHash: string;
    versionNo: number;
    scan: { buffer: Buffer; contentType: string };
    ip?: string;
    at?: number;
  },
): Promise<SignAuthorizationResult> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  if (!input.signerName.trim() || input.signerName.length > 128) {
    return { ok: false, reason: "bad_signer" };
  }
  if (!SCAN_ALLOWED_TYPES.includes(input.scan.contentType) || input.scan.buffer.length > SCAN_MAX_SIZE) {
    return { ok: false, reason: "bad_file" };
  }

  const [rows] = await db.query("SELECT * FROM procurement_projects WHERE id = ? LIMIT 1", [input.projectId]);
  const project = (rows as Array<{ id: number; status: string; version_no: number; reference: string; title_zh: string; buyer_user_id?: number }>)[0];
  // 归属校验由路由层完成（JOIN buyers.user_id）；这里只挡不存在
  if (!project) return { ok: false, reason: "not_found" };
  if (project.status !== "submitted" && project.status !== "under_review") {
    return { ok: false, reason: "not_signable" };
  }
  if (input.versionNo !== Number(project.version_no)) {
    return { ok: false, reason: "version_conflict" };
  }
  const [buyerRows] = await db.query(
    "SELECT org_name FROM procurement_buyers WHERE id = ? LIMIT 1",
    [(project as unknown as { buyer_id: number }).buyer_id],
  );
  const buyerOrgName = String((buyerRows as Array<{ org_name: string }>)[0]?.org_name ?? "");
  const expectedHash = computeLetterHash({
    reference: String(project.reference ?? ""),
    versionNo: Number(project.version_no ?? 0),
    buyerOrgName,
    projectTitle: String(project.title_zh ?? ""),
  });
  if (input.letterHash.toLowerCase() !== expectedHash) {
    return { ok: false, reason: "letter_mismatch" };
  }

  const bufferHash = createHash("sha256").update(input.scan.buffer).digest("hex");
  const ext =
    input.scan.contentType === "application/pdf"
      ? "pdf"
      : input.scan.contentType === "image/png"
        ? "png"
        : input.scan.contentType === "image/webp"
          ? "webp"
          : "jpg";
  const { url, filename } = await saveProcurementScan({
    filename: `authscan_${input.projectId}_${input.signerUid}_${Date.now()}.${ext}`,
    buffer: input.scan.buffer,
    contentType: input.scan.contentType,
    uploadedBy: input.signerUid,
  });

  const [ins] = await db.execute(
    `INSERT INTO procurement_authorizations
       (project_id, version_no, letter_template_version, letter_hash, method,
        scan_file_key, scan_file_hash, signer_name, signer_uid, signed_at, confirm_ip, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'upload_scan', ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [
      input.projectId,
      Number(project.version_no ?? 0),
      AUTH_LETTER_TEMPLATE_VERSION,
      input.letterHash.toLowerCase(),
      filename,
      bufferHash,
      input.signerName.trim(),
      input.signerUid,
      at,
      input.ip || null,
      at,
      at,
    ],
  );
  return { ok: true, id: Number((ins as { insertId?: number }).insertId ?? 0), fileUrl: url };
}

/** 当前版本的授权状态视图（打印页/工作台/发布闸共用） */
export async function getAuthorizationStatus(
  db: Pool,
  projectId: number,
): Promise<{
  letterHash: string;
  versionNo: number;
  status: "none" | "pending" | "verified" | "rejected";
  signerName: string | null;
  signedAt: number | null;
  rejectReason: string | null;
} | null> {
  const [rows] = await db.query("SELECT * FROM procurement_projects WHERE id = ? LIMIT 1", [projectId]);
  const project = (rows as Array<{ version_no: number; reference: string; title_zh: string; buyer_id: number }>)[0];
  if (!project) return null;
  const [buyerRows] = await db.query("SELECT org_name FROM procurement_buyers WHERE id = ? LIMIT 1", [project.buyer_id]);
  const buyerOrgName = String((buyerRows as Array<{ org_name: string }>)[0]?.org_name ?? "");
  const letterHash = computeLetterHash({
    reference: String(project.reference ?? ""),
    versionNo: Number(project.version_no ?? 0),
    buyerOrgName,
    projectTitle: String(project.title_zh ?? ""),
  });
  const [recs] = await db.query(
    `SELECT status, signer_name, signed_at, reject_reason FROM procurement_authorizations
      WHERE project_id = ? AND version_no = ? ORDER BY id DESC LIMIT 1`,
    [projectId, Number(project.version_no ?? 0)],
  );
  const rec = (recs as AuthorizationRow[])[0];
  return {
    letterHash,
    versionNo: Number(project.version_no ?? 0),
    status: rec ? (String(rec.status) as "pending" | "verified" | "rejected") : "none",
    signerName: rec ? String(rec.signer_name ?? "") : null,
    signedAt: rec ? Number(rec.signed_at ?? 0) : null,
    rejectReason: rec?.reject_reason == null ? null : String(rec.reject_reason),
  };
}

/** 发布闸：当前版本授权必须已核验通过 */
export async function isAuthorizationVerified(db: Pool, projectId: number, versionNo: number): Promise<boolean> {
  const [rows] = await db.query(
    `SELECT status FROM procurement_authorizations
      WHERE project_id = ? AND version_no = ? ORDER BY id DESC LIMIT 1`,
    [projectId, versionNo],
  );
  const row = (rows as Array<{ status: string }>)[0];
  return Boolean(row) && String(row.status) === "verified";
}
