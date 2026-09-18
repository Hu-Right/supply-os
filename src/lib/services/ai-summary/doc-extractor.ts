/**
 * 公告附件文本提取
 * @module lib/services/ai-summary/doc-extractor
 * @description 下载公告附件（PDF/DOCX），提取纯文本，拼接为摘要供 AI prompt 使用。
 *              仅取前 MAX_DOCS 个附件，单文件最大 MAX_BYTES，总文本截断至 MAX_TOTAL。
 *              提取失败静默降级（返回空字符串），不阻断 AI 分析主流程。
 */
import { fetchWithTimeout } from "../translation/fetchWithTimeout";

const MAX_DOCS = 2;
const MAX_BYTES = 2 * 1024 * 1024; // 单文件 2MB 上限
const MAX_TOTAL = 3000; // 总文本字符上限
const DOWNLOAD_TIMEOUT_MS = 15_000;

export interface DocAttachment {
  url?: string;
  link?: string;
  name?: string;
  title?: string;
  label?: string;
}

type RawDoc = DocAttachment | string;

function docUrl(item: RawDoc): string | undefined {
  if (typeof item === "string") return item;
  return item.url || item.link || undefined;
}

function docName(item: RawDoc): string {
  if (typeof item === "string") return item;
  return item.name || item.title || item.label || item.url || item.link || "attachment";
}

/** 根据文件扩展名判断类型 */
function fileType(nameOrUrl: string): "pdf" | "docx" | "txt" | "unknown" {
  const lower = nameOrUrl.toLowerCase().split("?")[0];
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".txt") || lower.endsWith(".text")) return "txt";
  return "unknown";
}

/** 下载附件为 Buffer */
async function downloadBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetchWithTimeout(url, { method: "GET" }, DOWNLOAD_TIMEOUT_MS);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > MAX_BYTES ? buf.subarray(0, MAX_BYTES) : buf;
  } catch {
    return null;
  }
}

/** PDF → 文本 */
async function extractPdf(buf: Buffer): Promise<string> {
  try {
    // pdf-parse v2 导出 PDFParse 类（非函数），CJS 模块动态 require
    const { PDFParse } = require("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    const result = await parser.getText();
    await parser.destroy();
    return String(result.text || "").trim();
  } catch {
    return "";
  }
}

/** DOCX → 文本 */
async function extractDocx(buf: Buffer): Promise<string> {
  try {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer: buf });
    return String(result.value || "").trim();
  } catch {
    return "";
  }
}

/** 提取单个附件文本 */
async function extractOne(item: RawDoc): Promise<string> {
  const url = docUrl(item);
  if (!url) return "";
  const name = docName(item);
  const type = fileType(name);
  if (type === "unknown") return "";

  const buf = await downloadBuffer(url);
  if (!buf) return "";

  if (type === "pdf") return await extractPdf(buf);
  if (type === "docx") return await extractDocx(buf);
  if (type === "txt") return buf.toString("utf-8").trim();
  return "";
}

/**
 * 批量提取公告附件文本（前 MAX_DOCS 个），拼接为摘要
 * @param documents 公告 documents 字段（数组，元素为对象或 URL 字符串）
 * @returns 拼接后的纯文本摘要（已截断）
 */
export async function extractAttachmentsText(documents: unknown): Promise<string> {
  const docs = Array.isArray(documents) ? (documents as RawDoc[]) : [];
  if (docs.length === 0) return "";

  const texts: string[] = [];
  for (let i = 0; i < Math.min(docs.length, MAX_DOCS); i++) {
    const text = await extractOne(docs[i]);
    if (text) {
      const name = docName(docs[i]);
      texts.push(`--- ${name} ---\n${text}`);
    }
  }

  const combined = texts.join("\n\n");
  return combined.length > MAX_TOTAL ? combined.slice(0, MAX_TOTAL) : combined;
}
