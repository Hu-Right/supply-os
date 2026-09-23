/**
 * 文件上传服务
 * File Upload Service
 *
 * @module lib/services/file-upload
 * @description 收口文件上传逻辑：验证、保存、返回 URL。
 *              支持图片类型验证和大小限制。
 *              营业执照类敏感文件不再落 public/（standalone 部署每次
 *              cp -rT 会整体替换 public，运行时写入会被抹掉），改存
 *              仓库根 runtime/uploads/license/，经鉴权路由 /api/user/enterprise/license/[filename] 回图。
 */
import { writeFile, mkdir, unlink } from "node:fs/promises";
import { join, isAbsolute, resolve } from "node:path";
import { existsSync } from "node:fs";

/** 向上逐级查找仓库根（含 .git 的目录）；限定最大上溯层数避免越界。 */
function findRepoRoot(start: string): string {
  let dir = resolve(start);
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(start);
}

export interface UploadResult {
  url: string;
  filename: string;
}

export interface UploadOptions {
  /** 上传目录（相对 process.cwd()；public 前缀URL 或 runtime 等独立目录均可） */
  uploadDir: string;
  /** 文件名前缀 */
  filenamePrefix: string;
  /** 允许的文件类型 */
  allowedTypes: string[];
  /** 最大文件大小（字节） */
  maxSize: number;
  /** 自定义访问 URL 前缀（如鉴权路由 /api/...）；缺省按 public 静态路径拼接 */
  urlPrefix?: string;
}

const DEFAULT_OPTIONS: UploadOptions = {
  uploadDir: "uploads",
  filenamePrefix: "file",
  allowedTypes: ["image/jpeg", "image/png", "image/webp"],
  maxSize: 5 * 1024 * 1024, // 5MB
};

/**
 * 保存上传文件到 public/uploads/ 目录
 * @param file - 上传的文件
 * @param options - 上传选项
 * @returns 上传结果（URL 和文件名）
 */
export async function saveUploadedFile(
  file: File,
  options: Partial<UploadOptions> = {},
): Promise<UploadResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // 验证文件类型
  if (!opts.allowedTypes.includes(file.type)) {
    throw new Error(`仅支持 ${opts.allowedTypes.join(", ")} 格式`);
  }

  // 验证文件大小
  if (file.size > opts.maxSize) {
    throw new Error(`文件大小不能超过 ${Math.round(opts.maxSize / 1024 / 1024)}MB`);
  }

  // 生成文件名
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const filename = `${opts.filenamePrefix}_${Date.now()}.${ext}`;

  // 保存文件：uploadDir 为绝对路径时直接使用（如仓库根 runtime/），否则落在 public/ 下
  const uploadDir = isAbsolute(opts.uploadDir)
    ? opts.uploadDir
    : join(process.cwd(), "public", opts.uploadDir);
  await mkdir(uploadDir, { recursive: true });
  const filePath = join(uploadDir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  return {
    url: opts.urlPrefix ? `${opts.urlPrefix}/${filename}` : `/${opts.uploadDir}/${filename}`,
    filename,
  };
}

/** 执照文件名白名单格式：license_<uid>_<ts>.<ext>（拒绝任何路径分隔符/穿越） */
export const LICENSE_FILENAME_RE = /^license_[0-9a-zA-Z_-]{1,80}\.(jpg|jpeg|png|webp)$/;

/** 新式鉴权 URL 前缀（存库与回图路由共用同一事实源） */
export const LICENSE_URL_PREFIX = "/api/user/enterprise/license";

/** 执照落盘目录：<仓库根>/runtime/uploads/license。
 *  仓库根靠向上查找 .git 确定（不依赖 pm2 实际 cwd 是仓库根还是 .next/standalone；
 *  且避开 standalone 目录下伪造的 package.json）。runtime/ 已被 gitignore，
 *  git reset --hard 与 cp -rT public 均不会波及，跨部署持久。 */
export function licenseUploadDir(): string {
  return resolve(join(findRepoRoot(process.cwd()), "runtime", "uploads", "license"));
}

/** 从执照文件名提取归属 userId（格式 license_<uid>_<ts>.<ext>）；非法返回 0 */
export function parseLicenseUid(filename: string): number {
  const m = /^license_(\d+)_[0-9]+\.(?:jpg|jpeg|png|webp)$/.exec(filename);
  return m ? Number(m[1]) : 0;
}

/** 按文件名在候选目录中查找已落盘的执照（runtime 新址优先，两处 public 为历史兜底）；找不到返回 null */
export function findLicenseFileByFilename(filename: string): string | null {
  if (!LICENSE_FILENAME_RE.test(filename)) return null;
  const dir = licenseUploadDir();
  const candidates = [
    resolve(join(dir, filename)),
    // 历史文件两处兜底：dev 下落在 <cwd>/public；standalone 迁移前落在 <repo>/.next/standalone/public
    resolve(join(process.cwd(), "public", "uploads", "license", filename)),
    resolve(join(process.cwd(), "..", "..", "public", "uploads", "license", filename)),
  ];
  const hit = candidates.find((p) => existsSync(p)) ?? null;
  // 路径穿越双保险：解析后必须仍在候选目录内
  if (hit && !candidates.includes(hit)) return null;
  return hit;
}

/**
 * 解析执照 URL → 磁盘绝对路径（含路径穿越校验）。
 * - 新式：/api/user/enterprise/license/<filename> → runtime/uploads/license/
 * - 存量兼容：/uploads/license/<filename> → 源码 public/ 或 standalone public/（两处都可能存有历史文件）
 * 找不到返回 null。
 */
export function resolveLicenseFilePath(url: string): string | null {
  let filename: string;
  if (url.startsWith(`${LICENSE_URL_PREFIX}/`)) {
    filename = url.slice(LICENSE_URL_PREFIX.length + 1);
  } else if (url.startsWith("/uploads/license/")) {
    filename = url.slice("/uploads/license/".length);
  } else {
    return null;
  }
  return findLicenseFileByFilename(filename);
}

/**
 * 删除文件（如果存在）
 * @param url - 文件 URL：执照鉴权 URL（/api/user/enterprise/license/xxx.jpg）或存量 /uploads/license/xxx.jpg 均按执照规则解析；其余按 public/ 静态路径
 */
export async function deleteFile(url: string): Promise<void> {
  if (url.startsWith(`${LICENSE_URL_PREFIX}/`) || url.startsWith("/uploads/license/")) {
    const filePath = resolveLicenseFilePath(url);
    if (filePath) await unlink(filePath).catch(() => undefined);
    return;
  }
  const filePath = join(process.cwd(), "public", url);
  if (existsSync(filePath)) {
    await unlink(filePath);
  }
}
