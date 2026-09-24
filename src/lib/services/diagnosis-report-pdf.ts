/**
 * 供应商投标能力诊断报告 v2 —— PDF 生成
 * Supplier Bid-Capability Diagnosis Report (v2) PDF generator
 *
 * @module lib/services/diagnosis-report-pdf
 * @description 报告内容严格限定为「本次诊断实际采集到的东西」：10 维度得分与判据、
 *              缺口优先级、19 题原始作答。v1 报告里的市场策略 / KPI 建议 / 90 天行动计划
 *              等章节是由 8 个字段推断出来的成段文案，与"诊断不够权威"的原始问题同源，
 *              因此本版**不搬**这些章节；要补叙事建议，应走 AI 且有明确数据边界。
 *              配色与字体沿用 v1 规范（NAVY/GREEN/AMBER + SimHei 中英混排）。
 */
import "server-only";
import path from "path";
import fs from "fs";
import PDFDocument from "pdfkit";
import { DIAGNOSIS_FIELDS } from "@/shared/constants/diagnosis-dimensions";
import { gradeDescriptor, gapPriority, rankByGap, type DiagnosisGrade } from "./scoring/diagnosis-v2";

export interface ReportDimension {
  no: number;
  name: string;
  weight: number;
  rawScore: number;
  weightedScore: number;
  evidenceSource: string;
  scoringBasis: string;
  needsManualReview: boolean;
}

export interface DiagnosisReportInput {
  id?: number;
  companyName: string;
  assessDate: string;
  totalScore: number;
  grade: string;
  dimensions: ReportDimension[];
  /** key = 字段名（与 DIAGNOSIS_FIELDS 一致）；多选为数组 */
  answers: Record<string, string | string[]>;
  overrideGate?: { triggered: boolean; reason: string };
}

const NAVY = "#0A2A55";
const GREEN = "#0CAF8C";
const LIGHT_BG = "#F0F4F8";
const WHITE = "#FFFFFF";
const DARK = "#1E293B";
const GRAY = "#64748B";
const LIGHT_GRAY = "#E2E8F0";
const RED = "#DC2626";
const AMBER = "#D97706";

const PAGE_W = 595.28;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

function getFontPath(): string {
  const candidates = [
    path.join(process.cwd(), "public", "fonts", "SimHei.ttf"),
    path.join(process.cwd(), "src", "lib", "fonts", "SimHei.ttf"),
  ];
  for (const p of candidates) {
    try { fs.accessSync(p); return p; } catch { /* next */ }
  }
  throw new Error("SimHei.ttf font not found");
}

/** 简易表格：逐行写单元格并按最高者决定行高，翻页由 ensureSpace 处理 */
function drawTable(
  doc: PDFKit.PDFDocument, font: string, y: number,
  headers: string[], colWidths: number[], rows: string[][],
  onCellColor?: (rowIdx: number, colIdx: number) => string | undefined,
): number {
  const hh = 20;
  const ensure = (need: number) => {
    if (y + need > doc.page.height - MARGIN) { doc.addPage(); y = MARGIN; }
  };

  ensure(hh);
  doc.rect(MARGIN, y, CONTENT_W, hh).fill(NAVY);
  let cx = MARGIN + 6;
  headers.forEach((h, i) => {
    doc.font(font).fontSize(8).fillColor(WHITE).text(h, cx, y + 6, { width: colWidths[i] - 8 });
    cx += colWidths[i];
  });
  y += hh;

  rows.forEach((row, rowIdx) => {
    // 先测最高单元格（heightOfString 自动换行），再统一绘背景与文字
    let maxBottom = y;
    row.forEach((cell, i) => {
      doc.font(font).fontSize(8);
      const h = doc.heightOfString(cell || "-", { width: colWidths[i] - 8 });
      maxBottom = Math.max(maxBottom, y + 6 + h);
    });
    const rowH = maxBottom - y + 6;
    ensure(rowH);
    if (rowIdx % 2 === 1) doc.rect(MARGIN, y, CONTENT_W, rowH).fill(LIGHT_BG);
    doc.moveTo(MARGIN, y + rowH).lineTo(MARGIN + CONTENT_W, y + rowH).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();

    let x = MARGIN + 6;
    row.forEach((cell, i) => {
      const color = onCellColor?.(rowIdx, i);
      doc.font(font).fontSize(8).fillColor(color ?? DARK)
        .text(cell || "-", x, y + 6, { width: colWidths[i] - 8 });
      x += colWidths[i];
    });
    y += rowH;
  });

  return y;
}

function sectionTitle(doc: PDFKit.PDFDocument, font: string, y: number, title: string): number {
  if (y + 34 > doc.page.height - MARGIN) { doc.addPage(); y = MARGIN; }
  doc.rect(MARGIN, y + 2, 3, 13).fill(GREEN);
  doc.font(font).fontSize(11).fillColor(NAVY).text(title, MARGIN + 10, y, { width: CONTENT_W - 10 });
  return doc.y + 8;
}

const GRADE_COLOR: Record<string, string> = { A: GREEN, B: AMBER, C: RED };

/** 输出为 Buffer：pdfkit 是流式写入，必须 end 并收集 data 分片 */
export function generateDiagnosisPdf(input: DiagnosisReportInput): Promise<Buffer> {
  const font = getFontPath();
  const doc = new PDFDocument({ size: "A4", margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN }, bufferPages: true });
  doc.info.Title = `国际公共采购能力诊断报告 ${input.companyName}`;
  doc.info.Author = "云境·国际采购平台";
  doc.addPage();

  // ── 封面带 ──
  doc.rect(0, 0, PAGE_W, 96).fill(NAVY);
  doc.font(font).fontSize(17).fillColor(WHITE).text("国际公共采购能力诊断报告", MARGIN, 26, { width: CONTENT_W - 150 });
  doc.font(font).fontSize(9).fillColor("#9DB6D8").text("Supplier Bid-Capability Diagnosis · v2（10 维度 19 题）", MARGIN, 52, { width: CONTENT_W - 150 });
  doc.font(font).fontSize(9).fillColor(WHITE).text([
    `企业：${input.companyName || "-"}`,
    `评估日期：${input.assessDate}`,
    input.id ? `诊断编号：#${input.id}` : "",
  ].filter(Boolean).join("\n"), PAGE_W - MARGIN - 170, 24, { width: 170, align: "right" });

  // ── 结论区 ──
  const grade = (["A", "B", "C"].includes(input.grade) ? input.grade : "C") as DiagnosisGrade;
  const descriptor = gradeDescriptor(grade);
  let y = 118;
  doc.roundedRect(MARGIN, y, CONTENT_W, 78, 8).fill(LIGHT_BG);
  doc.font(font).fontSize(30).fillColor(GRADE_COLOR[grade]).text(`${Math.round(input.totalScore * 10) / 10}`, MARGIN + 16, y + 16, { width: 110 });
  doc.font(font).fontSize(8).fillColor(GRAY).text("/ 100 综合得分", MARGIN + 16, y + 56, { width: 110 });
  doc.font(font).fontSize(12).fillColor(NAVY).text(descriptor.label, MARGIN + 150, y + 16, { width: CONTENT_W - 166 });
  doc.font(font).fontSize(9).fillColor(DARK).text(`建议路径：${descriptor.path}`, MARGIN + 150, y + 36, { width: CONTENT_W - 166, lineGap: 2 });
  y += 90;

  if (input.overrideGate?.triggered && input.overrideGate.reason) {
    doc.font(font).fontSize(9).fillColor(RED).text(`红线提示：${input.overrideGate.reason}`, MARGIN, y, { width: CONTENT_W });
    y = doc.y + 12;
  }

  // ── 一、维度得分 ──
  y = sectionTitle(doc, font, y, "一、十维度得分与判据");
  y = drawTable(
    doc, font, y,
    ["No.", "维度", "权重", "达成(0-5)", "加权", "判据 / 证据来源"],
    [26, 96, 34, 50, 34, CONTENT_W - 240],
    input.dimensions.map((d) => [
      String(d.no), d.name, String(d.weight), `${d.rawScore}`, `${d.weightedScore}`,
      `${d.scoringBasis}（${d.evidenceSource}${d.needsManualReview ? "，待人工复核" : ""}）`,
    ]),
    (rowIdx, colIdx) => (colIdx === 3 && input.dimensions[rowIdx].rawScore <= 1 ? RED : undefined),
  );

  // ── 二、优先补强缺口 ──
  y = sectionTitle(doc, font, y + 10, "二、优先补强缺口（Top 5）");
  const gaps = rankByGap(input.dimensions).slice(0, 5);
  y = drawTable(
    doc, font, y,
    ["优先级", "维度", "当前加权", "说明"],
    [56, 120, 56, CONTENT_W - 232],
    gaps.map((d) => [
      gapPriority(d.rawScore), d.name, `${d.weightedScore}/${d.weight}`,
      d.no === 1 ? "本维度由企业档案完整度与人工核对状态派生，补全设置页资料即可提升" : d.scoringBasis,
    ]),
    (rowIdx, colIdx) => (colIdx === 0 ? (gapPriority(gaps[rowIdx].rawScore) === "High" ? RED : gapPriority(gaps[rowIdx].rawScore) === "Medium" ? AMBER : GRAY) : undefined),
  );

  // ── 三、作答清单（原始凭据回显） ──
  y = sectionTitle(doc, font, y + 10, "三、作答清单（诊断依据原始自述）");
  y = drawTable(
    doc, font, y,
    ["题目", "回答"],
    [CONTENT_W * 0.42 - 6, CONTENT_W * 0.58 - 6],
    DIAGNOSIS_FIELDS.map((f) => {
      const v = input.answers[f.key];
      const answer = Array.isArray(v) ? v.join("、") : String(v ?? "");
      return [f.labelZh, answer || "（未填）"];
    }),
  );

  // ── 尾注：数据边界声明（避免报告被当成尽调结论） ──
  if (y + 70 > doc.page.height - MARGIN) { doc.addPage(); y = MARGIN; }
  doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(LIGHT_GRAY).stroke();
  doc.font(font).fontSize(7.5).fillColor(GRAY).text(
    "数据来源说明：除「No.1 国际供应商档案就绪度」由企业档案主数据（含后台人工核对标记）派生外，" +
    "其余维度均来自供应商本次自述，未经第三方核验；本报告用于内部能力盘点与补强排序，" +
    "不构成对任何采购方或第三方的资质证明或履约担保。",
    MARGIN, y + 8, { width: CONTENT_W, lineGap: 2 },
  );

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}
