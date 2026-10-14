/**
 * 文件上传服务
 * File Upload Service
 *
 * @module lib/services/file-upload
 * @description 营业执照等运行时上传文件统一【字节入库】（crm_upload_files）：
 *              门户（云端）与后台审核（本地）连同一个数据库，文件随库共享，
 *              不依赖任何一台机器的磁盘路径。2026-10-14 执照文件随 standalone
 *              重部署蒸发的事故根因即"落盘在构建产物目录内"，入库后该类风险整体消失。
 *              文件名白名单 license_<uid>_<ts>.<ext>，uid 内嵌用于回图鉴权（仅上传者本人）与归责。
 */
import { getPool } from "../db/pool";

/** 执照文件名白名单格式：license_<uid>_<ts>.<ext>（拒绝任何路径分隔符/穿越） */
export const LICENSE_FILENAME_RE = /^license_[0-9a-zA-Z_-]{1,80}\.(jpg|jpeg|png|webp)$/;

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
};

/** 从执照文件名提取归属 userId（格式 license_<uid>_<ts>.<ext>）；非法返回 0 */
export function parseLicenseUid(filename: string): number {
  const m = /^license_(\d+)_[0-9]+\.(?:jpg|jpeg|png|webp)$/.exec(filename);
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
    `INSERT INTO crm_upload_files (filename, content, content_type, size_bytes, uploaded_by)
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
    `SELECT content, content_type FROM crm_upload_files WHERE filename = ? LIMIT 1`,
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
    .execute(`DELETE FROM crm_upload_files WHERE filename = ?`, [filename])
    .catch(() => undefined);
}
