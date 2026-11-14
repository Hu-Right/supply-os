/**
 * 产品清单导入（F02：上传 Excel 产品清单）
 * @module lib/services/procurement/spreadsheet
 *
 * @description 支持 .xlsx（ZIP + sharedStrings/sheet1 解析，零额外运行时依赖）与 .csv/.txt。
 *              返回结构化行，由调用方映射为采购明细；解析失败一律抛错，不静默出半份清单。
 */
import JSZip from "jszip";

export interface ImportedItemRow {
  lotNo: string;
  nameZh: string;
  spec: string;
  quantity: number | null;
  qtyUnit: string;
}

export interface ParsedProductList {
  items: ImportedItemRow[];
  /** 跳过的空行/无法识别行数（前端可提示） */
  skipped: number;
}

const LOT_ALIASES = ["标包", "标段", "lot", "包号"];
const NAME_ALIASES = ["产品", "名称", "品名", "货物", "服务", "name", "item", "product"];
const SPEC_ALIASES = ["规格", "型号", "参数", "技术要求", "spec", "model", "description"];
const QTY_ALIASES = ["数量", "qty", "quantity", "采购数量"];
const UNIT_ALIASES = ["单位", "unit", "uom"];

function norm(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

function pickIndex(header: string[], aliases: string[]): number {
  return header.findIndex((h) => aliases.some((a) => norm(h).includes(norm(a))));
}

/** CSV/TSV 解析（支持引号包裹与转义引号） */
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function colIndex(ref: string): number {
  const letters = ref.replace(/[0-9]/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function decodeXml(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** .xlsx → 二维表（第一个工作表） */
export async function parseXlsx(buffer: Buffer): Promise<string[][]> {
  const zip = await JSZip.loadAsync(buffer);
  const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("string");
  const shared: string[] = [];
  if (sharedXml) {
    for (const m of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1]));
      shared.push(decodeXml(texts.join("")));
    }
  }
  const sheet =
    (await zip.file("xl/worksheets/sheet1.xml")?.async("string")) ??
    (await zip.file("xl/worksheets/sheet.xml")?.async("string"));
  if (!sheet) throw new Error("XLSX_NO_SHEET");

  const rows: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = c[1];
      const body = c[2];
      const refMatch = attrs.match(/\br="([A-Z]+)\d+"/);
      const idx = refMatch ? colIndex(refMatch[1]) : cells.length;
      const type = attrs.match(/\bt="([^"]+)"/)?.[1] ?? "";
      let value: string;
      if (type === "s") {
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
        value = shared[Number(v)] ?? "";
      } else if (type === "inlineStr") {
        value = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1])).join("");
      } else {
        value = decodeXml(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "");
      }
      cells[idx] = value.trim();
    }
    if (cells.some((v) => v)) rows.push(Array.from(cells, (v) => v ?? ""));
  }
  return rows;
}

/** 表头映射 → 明细行（无表头时按 名称/规格/数量/单位/标包 顺序） */
export function rowsToItems(rows: string[][]): ParsedProductList {
  const nonEmpty = rows.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (nonEmpty.length === 0) return { items: [], skipped: 0 };

  const header = nonEmpty[0].map((c) => String(c ?? ""));
  const idx = {
    lot: pickIndex(header, LOT_ALIASES),
    name: pickIndex(header, NAME_ALIASES),
    spec: pickIndex(header, SPEC_ALIASES),
    qty: pickIndex(header, QTY_ALIASES),
    unit: pickIndex(header, UNIT_ALIASES),
  };
  const hasHeader = idx.name >= 0;
  const body = hasHeader ? nonEmpty.slice(1) : nonEmpty;
  const items: ImportedItemRow[] = [];
  let skipped = 0;

  for (const r of body) {
    const get = (i: number): string => (i >= 0 ? String(r[i] ?? "").trim() : "");
    const nameZh = hasHeader ? get(idx.name) : String(r[0] ?? "").trim();
    if (!nameZh) {
      skipped++;
      continue;
    }
    const qtyRaw = (hasHeader ? get(idx.qty) : String(r[2] ?? "")).replace(/[,，\s]/g, "");
    const quantity = qtyRaw && Number.isFinite(Number(qtyRaw)) ? Number(qtyRaw) : null;
    items.push({
      lotNo: hasHeader ? get(idx.lot) : String(r[4] ?? "").trim(),
      nameZh,
      spec: hasHeader ? get(idx.spec) : String(r[1] ?? "").trim(),
      quantity,
      qtyUnit: (hasHeader ? get(idx.unit) : String(r[3] ?? "")).trim() || "件",
    });
  }
  return { items, skipped };
}

/** 统一入口：按扩展名选择解析器 */
export async function parseProductList(buffer: Buffer, filename: string): Promise<ParsedProductList> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx")) {
    return rowsToItems(await parseXlsx(buffer));
  }
  if (lower.endsWith(".csv") || lower.endsWith(".txt") || lower.endsWith(".tsv")) {
    return rowsToItems(parseDelimited(buffer.toString("utf8")));
  }
  throw new Error("UNSUPPORTED_FORMAT");
}
