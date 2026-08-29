/**
 * 国际公采能力诊断报告 PDF 生成服务
 * International Public Procurement Diagnostic Report PDF Generator
 *
 * @module src/lib/services/supplier-readiness-pdf
 * @description 按 docx 模板风格生成完整 12 章节诊断报告 PDF。
 *              服务端专用（import "server-only"），输出为 Buffer。
 */
import "server-only";
import path from "path";
import PDFDocument from "pdfkit";
import type { ScoringResult, QualificationScoreInput } from "@/features/procurement/utils/scoringEngine";
import { scoreQualification } from "@/features/procurement/utils/scoringEngine";
import { generateDiagnosticReport, type DiagnosticReport } from "./diagnosticEngine";

// ── 类型 ──

export interface PdfReportInput extends QualificationScoreInput {
  id?: number;
  assessDate?: string;
}

// ── 颜色常量 ──

const NAVY = "#0A2A55";
const GREEN = "#0CAF8C";
const LIGHT_BG = "#F0F4F8";
const WHITE = "#FFFFFF";
const DARK = "#1E293B";
const GRAY = "#64748B";
const LIGHT_GRAY = "#E2E8F0";
const RED = "#DC2626";
const AMBER = "#D97706";
const PURPLE = "#7C3AED";

// ── 字体 ──

function getFontPath(): string {
  const candidates = [
    path.join(process.cwd(), "public", "fonts", "SimHei.ttf"),
    path.join(process.cwd(), "src", "lib", "fonts", "SimHei.ttf"),
  ];
  for (const p of candidates) {
    try { require("fs").accessSync(p); return p; } catch { /* next */ }
  }
  throw new Error("SimHei.ttf font not found");
}

// ── 工具：表格 ──

interface TableOpts {
  x: number; y: number; width: number; colWidths: number[]; rowHeight: number;
  headerHeight?: number; doc: PDFKit.PDFDocument; font: string; fontSize?: number;
  headerBg?: string; headerFg?: string;
}

function drawTable(opts: TableOpts, headers: string[], rows: string[][]): number {
  const { x, width, colWidths, rowHeight, doc, font, fontSize = 8 } = opts;
  const hh = opts.headerHeight || rowHeight + 4;
  const hbg = opts.headerBg || NAVY;
  const hfg = opts.headerFg || WHITE;
  let y = opts.y;

  // 表头
  doc.save();
  doc.rect(x, y, width, hh).fill(hbg);
  doc.font(font).fontSize(fontSize).fillColor(hfg);
  let cx = x;
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], cx + 4, y + 4, { width: colWidths[i] - 8, height: hh - 8, align: "center", lineBreak: false });
    cx += colWidths[i];
  }
  doc.restore();
  y += hh;

  // 数据行
  for (const row of rows) {
    const bg = rows.indexOf(row) % 2 === 0 ? WHITE : LIGHT_BG;
    if (y + rowHeight > doc.page.height - 50) { doc.addPage(); y = 50; }
    doc.save();
    doc.rect(x, y, width, rowHeight).fill(bg);
    doc.rect(x, y, width, rowHeight).stroke(LIGHT_GRAY);
    doc.font(font).fontSize(fontSize).fillColor(DARK);
    cx = x;
    for (let i = 0; i < row.length; i++) {
      if (i > 0) { doc.moveTo(cx, y).lineTo(cx, y + rowHeight).stroke(LIGHT_GRAY); }
      doc.text(row[i], cx + 4, y + 4, { width: colWidths[i] - 8, height: rowHeight - 8, align: i === 0 ? "left" : "center", lineBreak: false });
      cx += colWidths[i];
    }
    doc.restore();
    y += rowHeight;
  }
  return y;
}

// ── 工具：章节标题 ──

function sectionHeader(doc: PDFKit.PDFDocument, font: string, y: number, no: string, titleZh: string, titleEn: string): number {
  if (y > doc.page.height - 100) { doc.addPage(); y = 50; }
  doc.font(font).fontSize(13).fillColor(NAVY);
  doc.text(`${no}、${titleZh}`, 50, y, { width: doc.page.width - 100 });
  y += 18;
  doc.font(font).fontSize(9).fillColor(GRAY);
  doc.text(titleEn, 50, y, { width: doc.page.width - 100 });
  y += 18;
  return y;
}

// ── 工具：检查换页 ──

function checkPage(doc: PDFKit.PDFDocument, y: number, needed: number): number {
  if (y + needed > doc.page.height - 50) { doc.addPage(); return 50; }
  return y;
}

// ── 工具：进度条 ──

function drawBar(doc: PDFKit.PDFDocument, font: string, x: number, y: number, score: number, max: number, w: number, h: number) {
  const r = Math.min(score / max, 1);
  doc.save();
  doc.roundedRect(x, y, w, h, 2).fill(LIGHT_GRAY);
  if (r > 0) {
    const c = r >= 0.8 ? GREEN : r >= 0.6 ? AMBER : RED;
    doc.roundedRect(x, y, w * r, h, 2).fill(c);
  }
  doc.restore();
  doc.font(font).fontSize(8).fillColor(DARK);
  doc.text(`${score}/${max}`, x + w + 6, y - 1, { width: 40, align: "left" });
}

// ── 主函数 ──

export async function generateReadinessPdf(input: PdfReportInput): Promise<Buffer> {
  const scoring = scoreQualification(input);
  const report = generateDiagnosticReport(input, scoring, input.id, input.assessDate);
  const fontPath = getFontPath();
  const F = "SimHei";

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 50, bottom: 50, left: 50, right: 50 }, bufferPages: true, info: { Title: "国际公采能力诊断报告", Author: "国际采购供应链平台", Subject: `诊断报告 - ${input.company_name}` } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.registerFont(F, fontPath);

    const pw = doc.page.width - 100;
    const lx = 50;
    let y = 0;

    // ═══ 封面 ═══
    doc.save();
    doc.rect(0, 0, doc.page.width, 130).fill(NAVY);
    doc.font(F).fontSize(22).fillColor(WHITE);
    doc.text("国际公采能力诊断报告", 50, 25, { align: "center", width: pw });
    doc.fontSize(10).fillColor("#94A3B8");
    doc.text("INTERNATIONAL PUBLIC PROCUREMENT CAPABILITY DIAGNOSTIC REPORT", 50, 58, { align: "center", width: pw });
    doc.fontSize(14).fillColor(WHITE);
    doc.text(report.cover.companyName, 50, 85, { align: "center", width: pw });
    doc.restore();

    y = 150;
    // 封面信息表
    const coverRows = [
      ["报告名称 / Report Title", report.cover.reportTitle],
      ["诊断日期 / Assessment Date", report.cover.assessDate],
      ["诊断依据 / Basis", report.cover.basis],
      ["综合评分 / Overall Score", `${report.cover.score} / 100`],
      ["标准等级 / Standard Rating", `${report.cover.grade} / ${report.cover.gradeLabel}`],
      ["建议阶段 / Recommended Stage", report.cover.stage],
    ];
    y = drawTable({ x: lx, y, width: pw, colWidths: [150, pw - 150], rowHeight: 22, doc, font: F, fontSize: 9 }, ["项目 / Item", "内容 / Entry"], coverRows);

    y += 15;
    doc.font(F).fontSize(8).fillColor(GRAY);
    doc.text('说明：本报告采用标准化诊断口径。由于现阶段主要依据企业自报信息，本报告中的部分结论属于\u201c待证据核验\u201d。', lx, y, { width: pw });
    y += 12;
    doc.text("Note: This report follows the standardized diagnostic framework. Certain findings remain subject to evidence verification.", lx, y, { width: pw });

    // ═══ 一、报告基本信息 ═══
    y = checkPage(doc, y + 30, 200);
    y = sectionHeader(doc, F, y, "一", "报告基本信息", "1. Report Administration");

    const adminRows = report.admin.fields.map(f => [f.field, f.value, f.evidence]);
    y = drawTable({ x: lx, y, width: pw, colWidths: [100, pw - 220, 120], rowHeight: 20, doc, font: F, fontSize: 8 }, ["字段 / Field", "企业信息 / Company Information", "证据状态 / Evidence"], adminRows);

    y += 10;
    doc.font(F).fontSize(9).fillColor(DARK);
    doc.text(`标准结论：${report.admin.standardFinding}`, lx, y, { width: pw });
    y += 14;
    doc.font(F).fontSize(8).fillColor(GRAY);
    doc.text(`Standard Finding: ${report.admin.standardFindingEn}`, lx, y, { width: pw });

    // ═══ 二、企业基础画像 ═══
    y = checkPage(doc, y + 30, 200);
    y = sectionHeader(doc, F, y, "二", "企业基础画像与国际化能力", "2. Corporate Profile & Internationalization");

    const profRows = report.profile.items.map(p => [p.item, p.status, p.finding, p.recommendation]);
    y = drawTable({ x: lx, y, width: pw, colWidths: [80, 100, 120, pw - 300], rowHeight: 30, doc, font: F, fontSize: 7 }, ["诊断项 / Diagnostic", "当前情况", "诊断结果", "建议 / Recommendation"], profRows);

    // ═══ 三、标准/认证诊断 ═══
    y = checkPage(doc, y + 30, 150);
    y = sectionHeader(doc, F, y, "三", "标准与认证诊断", "3. Standards & Certification Diagnosis");

    if (report.standards.held.length > 0) {
      doc.font(F).fontSize(9).fillColor(DARK);
      doc.text("已持有认证：", lx, y);
      y += 14;
      const certRows = report.standards.held.map(c => [c.name, c.status]);
      y = drawTable({ x: lx, y, width: pw, colWidths: [pw / 2, pw / 2], rowHeight: 18, doc, font: F, fontSize: 8 }, ["认证名称", "状态"], certRows);
    }
    if (report.standards.gaps.length > 0) {
      y += 8;
      doc.font(F).fontSize(9).fillColor(DARK);
      doc.text("建议补齐认证：", lx, y);
      y += 14;
      const gapRows = report.standards.gaps.map(g => [g.gap, g.priority]);
      y = drawTable({ x: lx, y, width: pw, colWidths: [pw - 80, 80], rowHeight: 18, doc, font: F, fontSize: 8 }, ["认证缺口 / Gap", "优先级"], gapRows);
    }
    y += 6;
    for (const rec of report.standards.recommendations) {
      doc.font(F).fontSize(8).fillColor(DARK);
      doc.text(`• ${rec}`, lx + 10, y, { width: pw - 20 });
      y += 12;
    }

    // ═══ 四、UNSPSC 编码映射 ═══
    y = checkPage(doc, y + 30, 150);
    y = sectionHeader(doc, F, y, "四", "UNSPSC 产品编码映射", "4. UNSPSC Product Code Mapping");

    if (report.unspsc.products.length > 0) {
      const uRows = report.unspsc.products.map(u => [u.product, u.candidateCode, u.candidateName, u.matchLevel, u.note]);
      y = drawTable({ x: lx, y, width: pw, colWidths: [70, 65, 120, 50, pw - 305], rowHeight: 22, doc, font: F, fontSize: 7 }, ["产品", "候选编码", "编码名称", "匹配度", "建议"], uRows);
    }
    y += 8;
    doc.font(F).fontSize(8).fillColor(DARK);
    doc.text(report.unspsc.status, lx, y, { width: pw });
    y += 14;

    // ═══ 五、国际业务与履约 ═══
    y = checkPage(doc, y + 30, 200);
    y = sectionHeader(doc, F, y, "五", "国际业务与履约能力诊断", "5. International Business & Delivery Capability");

    const intlRows = report.international.items.map(i => [i.capability, i.result, i.risk, i.recommendation]);
    y = drawTable({ x: lx, y, width: pw, colWidths: [70, 90, 40, pw - 200], rowHeight: 26, doc, font: F, fontSize: 7 }, ["能力项 / Capability", "结果 / Finding", "风险", "诊断建议 / Recommendation"], intlRows);

    // ═══ 六、投标组织 ═══
    y = checkPage(doc, y + 30, 200);
    y = sectionHeader(doc, F, y, "六", "投标组织与英文文件能力诊断", "6. Bid Organization & English Documentation");

    const bidRows = report.bidOrg.modules.map(m => [m.module, m.status, m.owner, m.target, m.kpi]);
    y = drawTable({ x: lx, y, width: pw, colWidths: [60, 80, 70, 100, pw - 310], rowHeight: 26, doc, font: F, fontSize: 7 }, ["模块 / Module", "当前状态", "建议负责人", "目标状态", "KPI/动作"], bidRows);

    // ═══ 七、关键短板与风险 ═══
    y = checkPage(doc, y + 30, 150);
    y = sectionHeader(doc, F, y, "七", "关键短板与风险诊断", "7. Critical Gaps & Risk Assessment");

    const riskRows = report.risks.items.map(r => [r.id, r.risk, r.severity, r.impact, r.owner, r.due]);
    y = drawTable({ x: lx, y, width: pw, colWidths: [25, 110, 40, 120, 65, 40], rowHeight: 22, doc, font: F, fontSize: 7, headerBg: PURPLE }, ["ID", "风险事项 / Risk", "严重度", "影响 / Impact", "责任建议", "时限"], riskRows);

    // ═══ 八、市场匹配 ═══
    y = checkPage(doc, y + 30, 180);
    y = sectionHeader(doc, F, y, "八", "市场与订单匹配策略", "8. Market & Opportunity Matching Strategy");

    const mktRows = [
      ["优先订单类型", report.market.priorityOrders],
      ["优先产品", report.market.priorityProducts],
      ["优先采购方", report.market.priorityBuyers],
      ["优先区域", report.market.priorityRegions],
      ["Go/No-Go 门槛", report.market.goNoGoGate],
    ];
    y = drawTable({ x: lx, y, width: pw, colWidths: [100, pw - 100], rowHeight: 24, doc, font: F, fontSize: 8 }, ["维度 / Dimension", "建议策略 / Recommended Strategy"], mktRows);

    // ═══ 九、内部 KPI ═══
    y = checkPage(doc, y + 30, 250);
    y = sectionHeader(doc, F, y, "九", "建议内部国际公采准备 KPI", "9. Recommended Internal Readiness KPIs");

    const kpiRows = report.kpis.items.map(k => [k.area, k.day30, k.day60, k.day90, k.owner]);
    y = drawTable({ x: lx, y, width: pw, colWidths: [70, 100, 100, 100, pw - 370], rowHeight: 28, doc, font: F, fontSize: 7 }, ["KPI模块", "30天", "60天", "90天", "责任建议"], kpiRows);

    // ═══ 十、90天行动计划 ═══
    y = checkPage(doc, y + 30, 150);
    y = sectionHeader(doc, F, y, "十", "90天国际公采能力提升行动计划", "10. 90-Day International Procurement Readiness Roadmap");

    const rmRows = report.roadmap.phases.map(p => [p.days, p.actions, p.deliverables, p.acceptance]);
    y = drawTable({ x: lx, y, width: pw, colWidths: [60, 140, 100, pw - 300], rowHeight: 36, doc, font: F, fontSize: 7 }, ["阶段 / Phase", "重点工作 / Key Actions", "核心输出 / Deliverables", "完成标准 / Acceptance"], rmRows);

    // ═══ 十一、综合结论 ═══
    y = checkPage(doc, y + 30, 300);
    y = sectionHeader(doc, F, y, "十一", "综合诊断结论", "11. Overall Diagnostic Conclusion");

    // 等级标签
    const gc = report.conclusion.grade === "A" ? GREEN : report.conclusion.grade === "B" ? AMBER : RED;
    doc.save();
    doc.roundedRect(lx, y, 80, 50, 6).fill(gc);
    doc.font(F).fontSize(24).fillColor(WHITE);
    doc.text(report.conclusion.grade, lx, y + 5, { width: 80, align: "center" });
    doc.fontSize(10);
    doc.text(`${report.conclusion.score} 分`, lx, y + 32, { width: 80, align: "center" });
    doc.restore();

    const concRows = [
      ["当前定位", report.conclusion.position],
      ["核心优势", report.conclusion.strengths],
      ["首要短板", report.conclusion.gaps],
      ["建议进入阶段", report.conclusion.recommendedStage],
      ["推荐切入产品", report.conclusion.recommendedProducts],
      ["推荐投标方式", report.conclusion.recommendedRoute],
    ];
    y += 60;
    y = drawTable({ x: lx, y, width: pw, colWidths: [100, pw - 100], rowHeight: 24, doc, font: F, fontSize: 8 }, ["结论项 / Conclusion", "诊断结果 / Diagnostic Result"], concRows);

    // 最终诊断意见
    y += 12;
    doc.font(F).fontSize(10).fillColor(NAVY);
    doc.text("最终诊断意见 / Final Diagnostic Opinion", lx, y, { width: pw });
    y += 16;
    doc.font(F).fontSize(8).fillColor(DARK);
    doc.text(report.conclusion.finalOpinion, lx, y, { width: pw });
    y += 14;
    doc.font(F).fontSize(7).fillColor(GRAY);
    doc.text(report.conclusion.finalOpinionEn, lx, y, { width: pw });
    y += 20;

    // ═══ 核心评分矩阵（附录） ═══
    y = checkPage(doc, y + 30, 200);
    doc.font(F).fontSize(12).fillColor(NAVY);
    doc.text("附录：核心评分矩阵 / Appendix: Core Readiness Scoring Matrix", lx, y, { width: pw });
    y += 18;

    const mHeaders = ["No.", "评估维度", "权重", "评分", "加权分", "证据来源", "状态"];
    const mCols = [25, 160, 40, 40, 50, 55, pw - 370];
    const mRows = scoring.dimensions.map(d => [String(d.no), d.name, String(d.weight), `${d.rawScore}/5`, `${d.weightedScore}`, d.evidenceSource, d.needsManualReview ? "需补充" : "OK"]);
    mRows.push(["", "总计 / TOTAL", "100", "", `${scoring.totalScore}`, "", scoring.grade]);
    y = drawTable({ x: lx, y, width: pw, colWidths: mCols, rowHeight: 20, headerHeight: 24, doc, font: F, fontSize: 7 }, mHeaders, mRows);

    y += 12;
    for (const d of scoring.dimensions) {
      if (y > doc.page.height - 70) { doc.addPage(); y = 50; }
      doc.font(F).fontSize(8).fillColor(DARK);
      doc.text(`${d.no}. ${d.name}`, lx, y, { width: 280 });
      doc.text(`${d.weightedScore}/${d.weight}`, lx + 290, y, { width: 40, align: "right" });
      y += 12;
      drawBar(doc, F, lx + 10, y, d.rawScore, 5, 280, 8);
      y += 14;
      doc.font(F).fontSize(6).fillColor(GRAY);
      doc.text(d.scoringBasis, lx + 10, y, { width: pw - 20 });
      y += 12;
    }

    // ═══ 免责声明 ═══
    y = checkPage(doc, y + 40, 60);
    y += 10;
    doc.font(F).fontSize(7).fillColor(GRAY);
    doc.text(`免责声明：${report.disclaimer.zh}`, lx, y, { width: pw });
    y += 14;
    doc.text(`Disclaimer: ${report.disclaimer.en}`, lx, y, { width: pw });

    // 底部
    const ph = doc.page.height;
    doc.font(F).fontSize(6).fillColor(LIGHT_GRAY);
    doc.text("本报告由国际采购供应链平台自动生成 / Auto-generated by International Procurement & Supply Chain Platform", lx, ph - 30, { width: pw, align: "center" });

    doc.end();
  });
}
