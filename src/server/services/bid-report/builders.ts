/**
 * bid-report docx 段落/表格构件
 * Paragraph and table builder functions for docx report
 */
import "server-only";
import {
  AlignmentType,
  BorderStyle,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { SONG, HEI, NAVY, BLUE2, GREEN3, TABLE_BLUE, BORDER_GREY, safe } from "./constants";

// ── 段落构件 ──

/** 封面主标题（Title 0：黑体 18 加粗 居中） */
export function title0(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
    children: [new TextRun({ text, font: HEI, size: 36, bold: true, color: NAVY })],
  });
}

/** 一级章节（黑体 14 加粗） */
export function h1(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 80 },
    children: [new TextRun({ text, font: HEI, size: 28, bold: true, color: NAVY })],
  });
}

/** 二级章节（黑体 12 加粗） */
export function h2(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 160, after: 60 },
    children: [new TextRun({ text, font: HEI, size: 24, bold: true, color: BLUE2 })],
  });
}

/** 三级章节（宋体 11 加粗） */
export function h3(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 120, after: 40 },
    children: [new TextRun({ text, font: SONG, size: 22, bold: true, color: GREEN3 })],
  });
}

/** 普通行（宋体 11，可覆写样式） */
export function line(text: string, opts: { size?: number; color?: string; bold?: boolean; italics?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; before?: number; after?: number } = {}): Paragraph {
  return new Paragraph({
    alignment: opts.align,
    spacing: { before: opts.before ?? 0, after: opts.after ?? 60 },
    children: [
      new TextRun({
        text,
        font: SONG,
        size: opts.size ?? 22,
        color: opts.color,
        bold: opts.bold,
        italics: opts.italics,
      }),
    ],
  });
}

/** 正文段落（按换行分段 + 左缩进；空值渲染灰色"（无）"） */
export function bodyText(text: string): Paragraph[] {
  if (!text || text === "-") {
    return [line("（无）", { color: "AAAAAA", italics: true })];
  }
  return text
    .replace(/\r\n|\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .map(
      (l) =>
        new Paragraph({
          spacing: { before: 20, after: 40 },
          indent: { left: 360 },
          children: [new TextRun({ text: l, font: SONG, size: 22 })],
        })
    );
}

/** 带悬挂缩进的条目 */
export function bullet(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 20, after: 40 },
    indent: { left: 360, hanging: 180 },
    children: [new TextRun({ text, font: SONG, size: 22 })],
  });
}

// ── 表格构件 ──

export const tableBorders = {
  top: { style: BorderStyle.SINGLE, size: 6, color: BORDER_GREY },
  bottom: { style: BorderStyle.SINGLE, size: 6, color: BORDER_GREY },
  left: { style: BorderStyle.SINGLE, size: 6, color: BORDER_GREY },
  right: { style: BorderStyle.SINGLE, size: 6, color: BORDER_GREY },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 6, color: BORDER_GREY },
  insideVertical: { style: BorderStyle.SINGLE, size: 6, color: BORDER_GREY },
} as const;

export const cellMargins = { top: 80, bottom: 80, left: 80, right: 80 };

export function cell(
  width: number,
  paragraph: Paragraph,
  opts: { fill?: string; valign?: typeof VerticalAlign.CENTER | typeof VerticalAlign.TOP | typeof VerticalAlign.BOTTOM } = {}
): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: cellMargins,
    verticalAlign: opts.valign ?? VerticalAlign.CENTER,
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill } : undefined,
    children: [paragraph],
  });
}

/** 两列 KV 表格（左列蓝底标签 2600 + 右列内容 6400） */
export function kvTable(rows: Array<[string, string]>): Table {
  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    borders: tableBorders,
    rows: rows.map(([label, rawValue]) => {
      const value = rawValue === "" || rawValue === null || rawValue === undefined ? "—" : String(rawValue);
      return new TableRow({
        children: [
          cell(
            2600,
            new Paragraph({
              spacing: { before: 20, after: 20 },
              children: [new TextRun({ text: label, font: SONG, size: 20, bold: true, color: TABLE_BLUE })],
            }),
            { fill: "EEF3FC" }
          ),
          cell(
            6400,
            new Paragraph({
              spacing: { before: 20, after: 20 },
              children: [new TextRun({ text: value, font: SONG, size: 22 })],
            })
          ),
        ],
      });
    }),
  });
}

/** BoQ 工程量表（蓝底表头 + 斑马纹行） */
export function boqTable(products: any[]): Table {
  const headers: Array<[number, string]> = [
    [400, "序号"],
    [2000, "产品/服务名称"],
    [4500, "核心技术范围 (Scope of Supply)"],
    [800, "数量"],
    [1300, "单位"],
  ];
  const headerRow = new TableRow({
    children: headers.map(([w, text]) =>
      cell(
        w,
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 20, after: 20 },
          children: [new TextRun({ text, font: HEI, size: 20, bold: true, color: "FFFFFF" })],
        }),
        { fill: TABLE_BLUE }
      )
    ),
  });

  const dataRows = products.map((product, idx) => {
    const fill = idx % 2 === 1 ? "F5F8FF" : "FFFFFF";
    const name = typeof product === "string" ? product : safe(product?.name || product?.product);
    const scope =
      typeof product === "object" && product !== null
        ? safe(product.scope || product.description || product.spec)
        : "";
    const qty = typeof product === "object" && product !== null ? safe(product.quantity ?? product.qty ?? "1") : "1";
    const unit = typeof product === "object" && product !== null ? safe(product.unit || "套") : "套";
    const cells: Array<[number, string]> = [
      [400, String(idx + 1)],
      [2000, name],
      [4500, scope],
      [800, qty],
      [1300, unit],
    ];
    return new TableRow({
      children: cells.map(([w, text]) =>
        cell(
          w,
          new Paragraph({
            spacing: { before: 20, after: 20 },
            children: [new TextRun({ text, font: SONG, size: 20 })],
          }),
          { fill, valign: VerticalAlign.TOP }
        )
      ),
    });
  });

  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    borders: tableBorders,
    rows: [headerRow, ...dataRows],
  });
}

/** AI 深度分析块（summary / tech_specs / risks / advantages + 未知键遍历） */
export function aiAnalysisBlocks(aiAnalysis: Record<string, any>): Array<Paragraph | Table> {
  const blocks: Array<Paragraph | Table> = [];
  const asText = (v: any) => (Array.isArray(v) ? v.join("\n") : String(v ?? ""));
  if (aiAnalysis.summary) {
    blocks.push(h2("AI 深度分析摘要"), ...bodyText(asText(aiAnalysis.summary)));
  }
  if (aiAnalysis.tech_specs) {
    blocks.push(h2("技术规格解析"), ...bodyText(asText(aiAnalysis.tech_specs)));
  }
  if (aiAnalysis.risks) {
    blocks.push(h2("主要风险点"));
    const risks = Array.isArray(aiAnalysis.risks) ? aiAnalysis.risks : [aiAnalysis.risks];
    for (const risk of risks) {
      blocks.push(bullet("▲ " + (typeof risk === "string" ? risk : JSON.stringify(risk))));
    }
  }
  if (aiAnalysis.advantages) {
    blocks.push(h2("竞争优势建议"));
    const adv = Array.isArray(aiAnalysis.advantages) ? aiAnalysis.advantages : [aiAnalysis.advantages];
    for (const item of adv) {
      blocks.push(bullet("✓ " + (typeof item === "string" ? item : JSON.stringify(item))));
    }
  }
  const knownKeys = new Set(["summary", "tech_specs", "risks", "advantages"]);
  for (const [k, v] of Object.entries(aiAnalysis)) {
    if (knownKeys.has(k)) continue;
    if (typeof v === "string" && v !== "") {
      blocks.push(h3(k), ...bodyText(v));
    } else if (Array.isArray(v)) {
      blocks.push(h3(k));
      for (const item of v) {
        blocks.push(bullet("• " + (typeof item === "string" ? item : JSON.stringify(item))));
      }
    }
  }
  return blocks;
}

/** 生成时间戳（页脚：YYYY年MM月DD日 HH:mm） */
export function formatNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}年${pad(d.getMonth() + 1)}月${pad(d.getDate())}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
