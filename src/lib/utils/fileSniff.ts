/**
 * 上传文件内容嗅探
 *
 * @module lib/utils/fileSniff
 * @description 审查 P0-B5：上传校验此前只看客户端可控的 MIME，未校验文件
 *              内容（magic bytes），且任意扩展名可落盘到 public 目录，
 *              存在 .html/.svg 存储型 XSS 面。此处按扩展名白名单 + 内容
 *              嗅探双重校验，两者必须自洽才允许落盘。
 */

/** magic bytes 嗅探结果 */
export type SniffedKind =
  | "jpeg"
  | "png"
  | "gif"
  | "webp"
  | "pdf"
  | "zip"
  | "cfb" // 旧版 Office（doc/xls/ppt）复合文档
  | "rar"
  | "text"
  | null;

/** 扩展名 → 允许的内容类型（多值表示任一匹配即可） */
const EXT_KINDS: Record<string, SniffedKind[]> = {
  jpg: ["jpeg"],
  jpeg: ["jpeg"],
  png: ["png"],
  gif: ["gif"],
  webp: ["webp"],
  pdf: ["pdf"],
  zip: ["zip"],
  docx: ["zip"],
  xlsx: ["zip"],
  pptx: ["zip"],
  doc: ["cfb"],
  xls: ["cfb"],
  ppt: ["cfb"],
  rar: ["rar"],
  txt: ["text"],
  csv: ["text"],
};

const ALLOWED_EXTS = new Set(Object.keys(EXT_KINDS));

/** 读取文件头推断内容类型 */
export function sniffFileKind(buf: Buffer): SniffedKind {
  if (buf.length < 12) return buf.length > 0 ? "text" : null;
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  // PNG
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  )
    return "png";
  // GIF87a / GIF89a
  if (buf.subarray(0, 3).toString("latin1") === "GIF") return "gif";
  // RIFF....WEBP
  if (
    buf.subarray(0, 4).toString("latin1") === "RIFF" &&
    buf.subarray(8, 12).toString("latin1") === "WEBP"
  )
    return "webp";
  // PDF
  if (buf.subarray(0, 4).toString("latin1") === "%PDF") return "pdf";
  // ZIP（docx/xlsx/pptx 实为 zip 容器）
  if (buf[0] === 0x50 && buf[1] === 0x4b) return "zip";
  // CFB（旧版 Office）
  if (
    buf[0] === 0xd0 &&
    buf[1] === 0xcf &&
    buf[2] === 0x11 &&
    buf[3] === 0xe0
  )
    return "cfb";
  // RAR
  if (buf.subarray(0, 4).toString("latin1") === "Rar!") return "rar";
  // 无已知 magic：视为文本（首块不含 NUL 即接受为文本）
  const head = buf.subarray(0, Math.min(buf.length, 1024));
  if (!head.includes(0)) return "text";
  return null;
}

export interface UploadCheckResult {
  ok: boolean;
  /** 拒绝原因（ok=false 时有值） */
  reason?: string;
  /** 白名单内的安全扩展名（落盘文件名使用） */
  safeExt?: string;
}

/**
 * 校验上传文件：扩展名必须在白名单内，且内容嗅探结果与扩展名自洽。
 * @param filename 原始文件名
 * @param buffer 文件内容
 */
export function checkUploadFile(
  filename: string,
  buffer: Buffer,
): UploadCheckResult {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (!ext || !ALLOWED_EXTS.has(ext)) {
    return { ok: false, reason: `不支持的文件扩展名: ${ext || "无"}` };
  }

  const sniffed = sniffFileKind(buffer);
  const allowed = EXT_KINDS[ext] ?? [];

  if (!sniffed || !allowed.includes(sniffed)) {
    return {
      ok: false,
      reason: "文件内容与扩展名不符",
    };
  }

  // 文本类扩展名（txt/csv）额外拒绝疑似 HTML/SVG 内容，防止借文本扩展名
  // 上传脚本内容后被他处改名利用
  if (sniffed === "text") {
    const head = buffer.subarray(0, Math.min(buffer.length, 1024)).toString("latin1").toLowerCase();
    if (
      head.includes("<script") ||
      head.includes("<svg") ||
      head.includes("<!doctype html") ||
      head.includes("<html")
    ) {
      return { ok: false, reason: "文件包含不被允许的脚本内容" };
    }
  }

  return { ok: true, safeExt: ext };
}
