/**
 * 文件上传服务
 * File Upload Service
 *
 * @module lib/services/file-upload
 * @description 营业执照等运行时上传文件统一【字节入库】（upload_files）：
 *              门户（云端）与后台审核（本地）连同一个数据库，文件随库共享，
 *              不依赖任何一台机器的磁盘路径。2026-10-14 执照文件随 standalone
 *              重部署蒸发的事故根因即"落盘在构建产物目录内"，入库后该类风险整体消失。
 *              文件名白名单 license_<uid>_<ts>.<ext>，uid 内嵌用于回图鉴权（仅上传者本人）与归责。
 */
import { getPool } from "../db/pool";

/** 执照文件名白名单格式：license_<uid>_<ts>.<ext>（拒绝任何路径分隔符/穿越） */
export const LICENSE_FILENAME_RE = /^license_[0-9a-zA-Z_-]{1,80}\.(jpg|jpeg|png|webp|pdf)$/;

/** 新式鉴权 URL 前缀（存库与回图路由共用同一事实源） */
export const LICENSE_URL_PREFIX = "/api/user/enterprise/license";

/** 存量 URL 前缀（public/ 静态时代旧格式；读取/删除按文件名兼容） */
const LEGACY_LICENSE_URL_PREFIX = "/uploads/license";

export interface UploadResult {
  url: string;
  filename: string;
}

/** 从执照文件名取 MIME；未知扩展名回落通用二进制 */
export function licenseContentType(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

/** 从执照文件名提取归属 userId（格式 license_<uid>_<ts>.<ext>）；非法返回 0 */
export function parseLicenseUid(filename: string): number {
  const m = /^license_(\d+)_[0-9]+\.(?:jpg|jpeg|png|webp|pdf)$/.exec(filename);
  return m ? Number(m[1]) : 0;
}

/** 从执照 URL 提取文件名（新式/存量前缀均兼容）；非执照 URL 返回 null */
export function licenseFilenameFromUrl(url: string): string | null {
  const u = typeof url === "string" ? url.trim() : "";
  if (!u) return null;
  if (u.startsWith(`${LICENSE_URL_PREFIX}/`)) return u.slice(LICENSE_URL_PREFIX.length + 1);
  if (u.startsWith(`${LEGACY_LICENSE_URL_PREFIX}/`)) return u.slice(LEGACY_LICENSE_URL_PREFIX.length + 1);
  return null;
}

/** 上传字节入库（幂等：同文件名覆盖；文件名必须过白名单） */
export async function saveLicenseFile(params: {
  filename: string;
  buffer: Buffer;
  contentType: string;
  uploadedBy: number;
}): Promise<UploadResult> {
  if (!LICENSE_FILENAME_RE.test(params.filename)) {
    throw new Error("非法的执照文件名");
  }
  await getPool().execute(
    `INSERT INTO upload_files (filename, content, content_type, size_bytes, uploaded_by)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE content = VALUES(content), content_type = VALUES(content_type),
                             size_bytes = VALUES(size_bytes), uploaded_by = VALUES(uploaded_by)`,
    [params.filename, params.buffer, params.contentType, params.buffer.length, params.uploadedBy],
  );
  return { url: `${LICENSE_URL_PREFIX}/${params.filename}`, filename: params.filename };
}

/** 按文件名取文件字节；不存在/文件名非法返回 null */
export async function getLicenseFile(
  filename: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!LICENSE_FILENAME_RE.test(filename)) return null;
  const [rows] = await getPool().execute(
    `SELECT content, content_type FROM upload_files WHERE filename = ? LIMIT 1`,
    [filename],
  );
  const row = (rows as Array<{ content: Buffer; content_type: string }>)[0];
  if (!row?.content) return null;
  return { buffer: row.content, contentType: row.content_type || licenseContentType(filename) };
}

/**
 * 删除执照文件记录（如果存在）。
 * @param url - 执照 URL（新式/存量前缀均兼容）；非执照 URL 静默忽略（当前全部消费方均为执照清理）
 */
export async function deleteFile(url: string): Promise<void> {
  const filename = licenseFilenameFromUrl(url);
  if (!filename) return;
  await getPool()
    .execute(`DELETE FROM upload_files WHERE filename = ?`, [filename])
    .catch(() => undefined);
}

// ── 采购方代理授权文件（F01 第 7 项，buyerauth_<uid>_<ts>.<ext>） ──
// 回文件走 /api/procurement/buyer/auth-doc/[filename]（仅上传者本人），
// 评审后台直连同库 upload_files；与"执照"分通道，避免语义混用。

/** 代理授权文件白名单：buyerauth_<uid>_<ts>.<ext>（图片/PDF） */
export const BUYER_AUTH_DOC_FILENAME_RE = /^buyerauth_(\d+)_[0-9]+\.(jpg|jpeg|png|webp|pdf)$/;

/** 鉴权 URL 前缀 */
export const BUYER_AUTH_DOC_URL_PREFIX = "/api/procurement/buyer/auth-doc";

export function buyerAuthDocContentType(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

/** 从文件名提取归属 userId；非法返回 0 */
export function parseBuyerAuthDocUid(filename: string): number {
  const m = BUYER_AUTH_DOC_FILENAME_RE.exec(filename);
  return m ? Number(m[1]) : 0;
}

/** 上传代理授权文件字节入库（幂等：同文件名覆盖；文件名必须过白名单） */
export async function saveBuyerAuthDoc(params: {
  filename: string;
  buffer: Buffer;
  contentType: string;
  uploadedBy: number;
}): Promise<UploadResult> {
  if (!BUYER_AUTH_DOC_FILENAME_RE.test(params.filename)) {
    throw new Error("非法的授权文件名");
  }
  await getPool().execute(
    `INSERT INTO upload_files (filename, content, content_type, size_bytes, uploaded_by)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE content = VALUES(content), content_type = VALUES(content_type),
                             size_bytes = VALUES(size_bytes), uploaded_by = VALUES(uploaded_by)`,
    [params.filename, params.buffer, params.contentType, params.buffer.length, params.uploadedBy],
  );
  return { url: `${BUYER_AUTH_DOC_URL_PREFIX}/${params.filename}`, filename: params.filename };
}

/** 按文件名取代理授权文件字节；不存在/文件名非法返回 null */
export async function getBuyerAuthDoc(
  filename: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!BUYER_AUTH_DOC_FILENAME_RE.test(filename)) return null;
  const [rows] = await getPool().execute(
    `SELECT content, content_type FROM upload_files WHERE filename = ? LIMIT 1`,
    [filename],
  );
  const row = (rows as Array<{ content: Buffer; content_type: string }>)[0];
  if (!row?.content) return null;
  return { buffer: row.content, contentType: row.content_type || buyerAuthDocContentType(filename) };
}

// ── 授权书签署扫描件（新发布域，authscan_<projectId>_<uid>_<ts>.<ext>） ──
// 回文件走 /api/procurement/authorization-files/[filename]（归属人鉴权），
// 评审后台直连同库 upload_files。

/** 授权扫描件文件名白名单：authscan_<projectId>_<uid>_<ts>.<ext>（jpg/png/webp/pdf） */
export const PROCUREMENT_SCAN_FILENAME_RE =
  /^authscan_[0-9]+_[0-9a-zA-Z_-]{1,80}_[0-9]+\.(jpg|jpeg|png|webp|pdf)$/;

/** 新式鉴权 URL 前缀 */
export const PROCUREMENT_SCAN_URL_PREFIX = "/api/procurement/authorization-files";

export function procurementScanContentType(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
  }[ext] ?? "application/octet-stream";
}

/** 上传授权扫描件字节入库（幂等：同文件名覆盖；文件名必须过白名单） */
export async function saveProcurementScan(params: {
  filename: string;
  buffer: Buffer;
  contentType: string;
  uploadedBy: number;
}): Promise<{ url: string; filename: string }> {
  if (!PROCUREMENT_SCAN_FILENAME_RE.test(params.filename)) {
    throw new Error("非法的授权扫描件文件名");
  }
  await getPool().execute(
    `INSERT INTO upload_files (filename, content, content_type, size_bytes, uploaded_by)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE content = VALUES(content), content_type = VALUES(content_type),
                             size_bytes = VALUES(size_bytes), uploaded_by = VALUES(uploaded_by)`,
    [params.filename, params.buffer, params.contentType, params.buffer.length, params.uploadedBy],
  );
  return { url: `${PROCUREMENT_SCAN_URL_PREFIX}/${params.filename}`, filename: params.filename };
}

/** 按文件名取授权扫描件字节；不存在/文件名非法返回 null */
export async function getProcurementScan(
  filename: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!PROCUREMENT_SCAN_FILENAME_RE.test(filename)) return null;
  const [rows] = await getPool().execute(
    `SELECT content, content_type FROM upload_files WHERE filename = ? LIMIT 1`,
    [filename],
  );
  const row = (rows as Array<{ content: Buffer; content_type: string }>)[0];
  if (!row?.content) return null;
  return { buffer: row.content, contentType: row.content_type || procurementScanContentType(filename) };
}

// ── 采购需求附件（attach_<projectId>_<uid>_<ts>.<ext>，字节入库同执照口径） ──
// 门户回文件走 /api/procurement/attachment-files/[filename]（归属人鉴权），
// 评审后台直连同库 upload_files。

/** 需求附件文件名白名单：attach_<projectId>_<uid>_<ts>.<ext>（pdf/图片/office/zip） */
export const PROCUREMENT_FILE_FILENAME_RE =
  /^attach_[0-9]+_[0-9a-zA-Z_-]{1,80}_[0-9]+\.(jpg|jpeg|png|webp|pdf|doc|docx|xls|xlsx|zip)$/;

/** 新式鉴权 URL 前缀（存库与回文件路由共用同一事实源） */
export const PROCUREMENT_FILE_URL_PREFIX = "/api/procurement/attachment-files";

export function procurementFileContentType(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".zip": "application/zip",
  }[ext] ?? "application/octet-stream";
}

/** 上传需求附件字节入库（幂等：同文件名覆盖；文件名必须过白名单） */
export async function saveProcurementFile(params: {
  filename: string;
  buffer: Buffer;
  contentType: string;
  uploadedBy: number;
}): Promise<{ url: string; filename: string }> {
  if (!PROCUREMENT_FILE_FILENAME_RE.test(params.filename)) {
    throw new Error("非法的需求附件文件名");
  }
  await getPool().execute(
    `INSERT INTO upload_files (filename, content, content_type, size_bytes, uploaded_by)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE content = VALUES(content), content_type = VALUES(content_type),
                             size_bytes = VALUES(size_bytes), uploaded_by = VALUES(uploaded_by)`,
    [params.filename, params.buffer, params.contentType, params.buffer.length, params.uploadedBy],
  );
  return { url: `${PROCUREMENT_FILE_URL_PREFIX}/${params.filename}`, filename: params.filename };
}

/** 按文件名取需求附件字节；不存在/文件名非法返回 null */
export async function getProcurementFile(
  filename: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!PROCUREMENT_FILE_FILENAME_RE.test(filename)) return null;
  const [rows] = await getPool().execute(
    `SELECT content, content_type FROM upload_files WHERE filename = ? LIMIT 1`,
    [filename],
  );
  const row = (rows as Array<{ content: Buffer; content_type: string }>)[0];
  if (!row?.content) return null;
  return { buffer: row.content, contentType: row.content_type || procurementFileContentType(filename) };
}
