/**
 * 国际公采能力诊断报告 PDF 生成服务
 * International Public Procurement Diagnostic Report PDF Generator
 *
 * @module src/lib/services/supplier-readiness-pdf
 * @description 严格按 docx 模板风格生成完整 12 章节诊断报告 PDF。
 *              配色：NAVY #0A2A55 / GREEN #0CAF8C / AMBER #D97706 / RED #DC2624
 *              字体：SimHei 黑体，中英混排。
 *              服务端专用（import "server-only"），输出为 Buffer。
 */
import "server-only";
import path from "path";
import fs from "fs";
import PDFDocument from "pdfkit";
import type { ScoringResult, QualificationScoreInput } from "./scoring";
import { scoreQualification } from "./scoring";
import { generateDiagnosticReport, type DiagnosticReport } from "./diagnosticEngine";

// ── 类型 ──

export interface PdfReportInput extends QualificationScoreInput {
  id?: number;
  assessDate?: string;
}

// ── 颜色常量（严格对标 docx 模板） ──

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
    try { fs.accessSync(p); return p; } catch { /* next */ }
  }
  throw new Error("SimHei.ttf font not found");
}

// ── 工具：表格（允许换行 + 限制最大行高 + 自动换页） ──

interface TableOpts {
  x: number; y: number; width: number; colWidths: number[];
  doc: PDFKit.PDFDocument; font: string; fontSize?: number;
  headerBg?: string; headerFg?: string;
  rowHeight?: number;
}

function drawTable(opts: TableOpts, headers: string[], rows: string[][]): number {
  const { x, width, colWidths, doc, font, fontSize = 8 } = opts;
  const hbg = opts.headerBg || NAVY;
  const hfg = opts.headerFg || WHITE;
  const maxRh = opts.rowHeight || 60; // 最大行高（允许长文本换行）
  const minRh = 18; // 最小行高
  let y = opts.y;
  const hh = 20;

  // ── 表头 ──
  if (y + hh > doc.page.height - 50) { doc.addPage(); y = 50; }
  doc.save();
  doc.rect(x, y, width, hh).fill(hbg);
  doc.font(font).fontSize(fontSize).fillColor(hfg);
  let cx = x;
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], cx + 3, y + 4, { width: colWidths[i] - 6, align: "center", lineBreak: true });
    cx += colWidths[i];
  }
  doc.restore();
  y += hh;

  // ── 数据行 ──
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    // 计算本行实际需要的最大高度（基于文本换行）
    let rowH = minRh;
    for (let i = 0; i < row.length; i++) {
      const cellW = colWidths[i] - 6;
      const cellH = doc.font(font).fontSize(fontSize).heightOfString(String(row[i] ?? ""), { width: Math.max(cellW, 10) });
      if (cellH + 8 > rowH) rowH = cellH + 8;
    }
    rowH = Math.min(rowH, maxRh); // 限制最大行高

    // 换页检查
    if (y + rowH > doc.page.height - 50) { doc.addPage(); y = 50; }

    const bg = ri % 2 === 0 ? WHITE : LIGHT_BG;
    doc.save();
    doc.rect(x, y, width, rowH).fill(bg);
    doc.moveTo(x, y + rowH).lineTo(x + width, y + rowH).strokeColor(LIGHT_GRAY).stroke();
    cx = x;
    for (let i = 0; i < row.length; i++) {
      if (i > 0) doc.moveTo(cx, y).lineTo(cx, y + rowH).strokeColor(LIGHT_GRAY).stroke();
      doc.font(font).fontSize(fontSize).fillColor(DARK);
      doc.text(String(row[i] ?? ""), cx + 3, y + 4, {
        width: colWidths[i] - 6,
        height: rowH - 8,
        align: "left",
        lineBreak: true,
        // 不使用 ellipsis，让文本完整显示
      });
      cx += colWidths[i];
    }
    doc.restore();
    y += rowH;
  }
  return y;
}

// ── 工具：风险矩阵行（带严重度颜色标记） ──

function drawRiskTable(opts: TableOpts, rows: string[][]): number {
  const { x, width, colWidths, doc, font, fontSize = 7 } = opts;
  const maxRh = opts.rowHeight || 60;
  const minRh = 18;
  let y = opts.y;
  const hh = 20;

  // 表头
  if (y + hh > doc.page.height - 50) { doc.addPage(); y = 50; }
  doc.save();
  doc.rect(x, y, width, hh).fill(PURPLE);
  doc.font(font).fontSize(fontSize).fillColor(WHITE);
  const headers = ["ID", "风险事项 / Risk", "严重度", "影响 / Impact", "责任建议", "时限"];
  let cx = x;
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], cx + 3, y + 4, { width: colWidths[i] - 6, align: "center", lineBreak: true });
    cx += colWidths[i];
  }
  doc.restore();
  y += hh;

  // 数据行
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    let rowH = minRh;
    for (let i = 0; i < row.length; i++) {
      if (i === 2) continue; // 严重度列用标签，不需要计算高度
      const cellW = colWidths[i] - 6;
      const cellH = doc.font(font).fontSize(fontSize).heightOfString(String(row[i] ?? ""), { width: Math.max(cellW, 10) });
      if (cellH + 8 > rowH) rowH = cellH + 8;
    }
    rowH = Math.min(rowH, maxRh);
    if (y + rowH > doc.page.height - 50) { doc.addPage(); y = 50; }

    const bg = ri % 2 === 0 ? WHITE : LIGHT_BG;
    doc.save();
    doc.rect(x, y, width, rowH).fill(bg);
    doc.moveTo(x, y + rowH).lineTo(x + width, y + rowH).strokeColor(LIGHT_GRAY).stroke();

    cx = x;
    for (let i = 0; i < row.length; i++) {
      if (i > 0) doc.moveTo(cx, y).lineTo(cx, y + rowH).strokeColor(LIGHT_GRAY).stroke();

      if (i === 2) {
        const sev = String(row[2] || "").trim();
        const sevColor = sev === "High" ? RED : sev === "Medium" ? AMBER : GREEN;
        const tagW = 36; const tagH = 14;
        const tagX = cx + (colWidths[i] - tagW) / 2;
        const tagY = y + (rowH - tagH) / 2;
        doc.roundedRect(tagX, tagY, tagW, tagH, 3).fill(sevColor);
        doc.font(font).fontSize(6).fillColor(WHITE);
        doc.text(sev, tagX, tagY + 3, { width: tagW, align: "center" });
      } else {
        doc.font(font).fontSize(fontSize).fillColor(DARK);
        doc.text(String(row[i] ?? ""), cx + 3, y + 4, {
          width: colWidths[i] - 6,
          height: rowH - 8,
          align: "left",
          lineBreak: true,
          // 不使用 ellipsis
        });
      }
      cx += colWidths[i];
    }
    doc.restore();
    y += rowH;
  }
  return y;
}

// ── 工具：章节标题 ──

function sectionHeader(doc: PDFKit.PDFDocument, font: string, y: number, no: string, titleZh: string, titleEn: string): number {
  if (y > doc.page.height - 100) { doc.addPage(); y = 50; }
  // 章节编号 + 中文标题
  doc.font(font).fontSize(13).fillColor(NAVY);
  doc.text(`${no}、${titleZh}`, 50, y, { width: doc.page.width - 100 });
  y += 18;
  // 英文副标题
  doc.font(font).fontSize(9).fillColor(GRAY);
  doc.text(titleEn, 50, y, { width: doc.page.width - 100 });
  y += 16;
  // 分隔线
  doc.moveTo(50, y).lineTo(doc.page.width - 50, y).strokeColor(LIGHT_GRAY).stroke();
  y += 8;
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

// ── 工具：页脚 ──

function drawPageFooter(doc: PDFKit.PDFDocument, font: string) {
  const ph = doc.page.height;
  const pw = doc.page.width - 100;
  doc.font(font).fontSize(6).fillColor(LIGHT_GRAY);
  doc.text(
    "本报告由国际采购供应链平台自动生成 / Auto-generated by International Procurement & Supply Chain Platform",
    50, ph - 30, { width: pw, align: "center" }
  );
}

// ── 主函数 ──

export async function generateReadinessPdf(input: PdfReportInput): Promise<Buffer> {
  const scoring = scoreQualification(input);
  const report = generateDiagnosticReport(input, scoring, input.id, input.assessDate);
  const fontPath = getFontPath();
  const F = "SimHei";

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      bufferPages: true,
      info: {
        Title: "国际公采能力诊断报告",
        Author: "国际采购供应链平台",
        Subject: `诊断报告 - ${input.company_name}`,
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.registerFont(F, fontPath);

    const pw = doc.page.width - 100;
    const lx = 50;
    let y: number;

    // ═══════════════════════════════════════════════════════════════
    // 封面
    // ═══════════════════════════════════════════════════════════════
    doc.save();
    // 深蓝色顶部背景
    doc.rect(0, 0, doc.page.width, 140).fill(NAVY);
    // 报告标题（中文）
    doc.font(F).fontSize(22).fillColor(WHITE);
    doc.text("国际公采能力诊断报告", 50, 20, { align: "center", width: pw });
    // 报告标题（英文）
    doc.fontSize(10).fillColor("#94A3B8");
    doc.text("INTERNATIONAL PUBLIC PROCUREMENT CAPABILITY DIAGNOSTIC REPORT", 50, 52, { align: "center", width: pw });
    // 企业名称
    doc.fontSize(16).fillColor(WHITE);
    doc.text(report.cover.companyName, 50, 80, { align: "center", width: pw });
    // 诊断日期
    doc.fontSize(10).fillColor("#94A3B8");
    doc.text(`诊断日期：${report.cover.assessDate}`, 50, 110, { align: "center", width: pw });
    doc.restore();

    y = 160;
    // 封面信息表
    const coverRows = [
      ["报告名称 / Report Title", report.cover.reportTitle],
      ["诊断日期 / Assessment Date", report.cover.assessDate],
      ["诊断依据 / Basis", `${report.cover.basis} / ${report.cover.basisEn}`],
      ["综合评分 / Overall Score", `${report.cover.score} / 100`],
      ["标准等级 / Standard Rating", `${report.cover.grade} / ${report.cover.gradeLabel}`],
      ["建议阶段 / Recommended Stage", `${report.cover.stage}\n${report.cover.stageEn}`],
    ];
    y = drawTable(
      { x: lx, y, width: pw, colWidths: [150, pw - 150], doc, font: F, fontSize: 9, rowHeight: 22 },
      ["项目 / Item", "内容 / Entry"],
      coverRows
    );

    y += 15;
    doc.font(F).fontSize(8).fillColor(GRAY);
    doc.text('说明：本报告采用标准化诊断口径。由于现阶段主要依据企业自报信息，本报告中的部分结论属于"待证据核验"。', lx, y, { width: pw });
    y += 12;
    doc.text("Note: This report follows the standardized diagnostic framework. Certain findings remain subject to evidence verification.", lx, y, { width: pw });

    // ═══════════════════════════════════════════════════════════════
    // 一、报告基本信息
    // ═══════════════════════════════════════════════════════════════
    y = checkPage(doc, y + 30, 200);
    y = sectionHeader(doc, F, y, "一", "报告基本信息", "1. Report Administration");

    const adminRows = report.admin.fields.map(f => [f.field, f.value, f.evidence]);
    y = drawTable(
      { x: lx, y, width: pw, colWidths: [100, pw - 220, 120], doc, font: F, fontSize: 8, rowHeight: 18 },
      ["字段 / Field", "企业信息 / Company Information", "证据状态 / Evidence"],
      adminRows
    );

    y += 10;
    doc.font(F).fontSize(9).fillColor(DARK);
    doc.text(`标准结论：${report.admin.standardFinding}`, lx, y, { width: pw });
    y += 14;
    doc.font(F).fontSize(8).fillColor(GRAY);
    doc.text(`Standard Finding: ${report.admin.standardFindingEn}`, lx, y, { width: pw });

    // ═══════════════════════════════════════════════════════════════
    // 二、企业基础画像
    // ═══════════════════════════════════════════════════════════════
    y = checkPage(doc, y + 30, 200);
    y = sectionHeader(doc, F, y, "二", "企业基础画像与国际化能力", "2. Corporate Profile & Internationalization");

    const profRows = report.profile.items.map(p => [p.item, p.status, p.finding, p.recommendation]);
    y = drawTable(
      { x: lx, y, width: pw, colWidths: [80, 100, 120, pw - 300], doc, font: F, fontSize: 7, rowHeight: 18 },
      ["诊断项 / Diagnostic", "当前情况", "诊断结果", "建议 / Recommendation"],
      profRows
    );

    // ═══════════════════════════════════════════════════════════════
    // 三、标准/认证诊断
    // ═══════════════════════════════════════════════════════════════
    y = checkPage(doc, y + 30, 150);
    y = sectionHeader(doc, F, y, "三", "标准与认证诊断", "3. Standards & Certification Diagnosis");

    if (report.standards.held.length > 0) {
      doc.font(F).fontSize(9).fillColor(DARK);
      doc.text("已持有认证：", lx, y);
      y += 14;
      const certRows = report.standards.held.map(c => [c.name, c.status]);
      y = drawTable(
        { x: lx, y, width: pw, colWidths: [pw / 2, pw / 2], doc, font: F, fontSize: 8, rowHeight: 18 },
        ["认证名称", "状态"],
        certRows
      );
    }
    if (report.standards.gaps.length > 0) {
      y += 8;
      doc.font(F).fontSize(9).fillColor(DARK);
      doc.text("建议补齐认证：", lx, y);
      y += 14;
      const gapRows = report.standards.gaps.map(g => [g.gap, g.priority]);
      y = drawTable(
        { x: lx, y, width: pw, colWidths: [pw - 80, 80], doc, font: F, fontSize: 8, rowHeight: 18 },
        ["认证缺口 / Gap", "优先级"],
        gapRows
      );
    }
    y += 6;
    for (const rec of report.standards.recommendations) {
      doc.font(F).fontSize(8).fillColor(DARK);
      doc.text(`• ${rec}`, lx + 10, y, { width: pw - 20 });
      y += 12;
    }

    // ═══════════════════════════════════════════════════════════════
    // 四、UNSPSC 编码映射
    // ═══════════════════════════════════════════════════════════════
    y = checkPage(doc, y + 30, 150);
    y = sectionHeader(doc, F, y, "四", "UNSPSC 产品编码映射", "4. UNSPSC Product Code Mapping");

    if (report.unspsc.products.length > 0) {
      const uRows = report.unspsc.products.map(u => [u.product, u.candidateCode, u.candidateName, u.matchLevel, u.note]);
      y = drawTable(
        { x: lx, y, width: pw, colWidths: [70, 65, 120, 50, pw - 305], doc, font: F, fontSize: 7, rowHeight: 18 },
        ["产品", "候选编码", "编码名称", "匹配度", "建议"],
        uRows
      );
    }
    y += 8;
    doc.font(F).fontSize(8).fillColor(DARK);
    doc.text(report.unspsc.status, lx, y, { width: pw });
    y += 14;

    // ═══════════════════════════════════════════════════════════════
    // 五、国际业务与履约
    // ═══════════════════════════════════════════════════════════════
    y = checkPage(doc, y + 30, 200);
    y = sectionHeader(doc, F, y, "五", "国际业务与履约能力诊断", "5. International Business & Delivery Capability");

    const intlRows = report.international.items.map(i => [i.capability, i.result, i.risk, i.recommendation]);
    y = drawTable(
      { x: lx, y, width: pw, colWidths: [70, 90, 40, pw - 200], doc, font: F, fontSize: 7, rowHeight: 18 },
      ["能力项 / Capability", "结果 / Finding", "风险", "诊断建议 / Recommendation"],
      intlRows
    );

    // ═══════════════════════════════════════════════════════════════
    // 六、投标组织
    // ═══════════════════════════════════════════════════════════════
    y = checkPage(doc, y + 30, 200);
    y = sectionHeader(doc, F, y, "六", "投标组织与英文文件能力诊断", "6. Bid Organization & English Documentation");

    const bidRows = report.bidOrg.modules.map(m => [m.module, m.status, m.owner, m.target, m.kpi]);
    y = drawTable(
      { x: lx, y, width: pw, colWidths: [60, 80, 70, 100, pw - 310], doc, font: F, fontSize: 7, rowHeight: 18 },
      ["模块 / Module", "当前状态", "建议负责人", "目标状态", "KPI/动作"],
      bidRows
    );

    // ═══════════════════════════════════════════════════════════════
    // 七、关键短板与风险（带颜色标记的风险矩阵）
    // ═══════════════════════════════════════════════════════════════
    y = checkPage(doc, y + 30, 150);
    y = sectionHeader(doc, F, y, "七", "关键短板与风险诊断", "7. Critical Gaps & Risk Assessment");

    const riskRows = report.risks.items.map(r => [r.id, r.risk, r.severity, r.impact, r.owner, r.due]);
    y = drawRiskTable(
      { x: lx, y, width: pw, colWidths: [25, 110, 40, 120, 65, 40], doc, font: F, fontSize: 7 },
      riskRows
    );

    // ═══════════════════════════════════════════════════════════════
    // 八、市场匹配
    // ═══════════════════════════════════════════════════════════════
    y = checkPage(doc, y + 30, 180);
    y = sectionHeader(doc, F, y, "八", "市场与订单匹配策略", "8. Market & Opportunity Matching Strategy");

    const mktRows = [
      ["优先订单类型", report.market.priorityOrders],
      ["优先产品", report.market.priorityProducts],
      ["优先采购方", report.market.priorityBuyers],
      ["优先区域", report.market.priorityRegions],
      ["Go/No-Go 门槛", report.market.goNoGoGate],
      ["监控方法 / Search Method", report.market.searchMethod],
    ];
    y = drawTable(
      { x: lx, y, width: pw, colWidths: [100, pw - 100], doc, font: F, fontSize: 8, rowHeight: 20 },
      ["维度 / Dimension", "建议策略 / Recommended Strategy"],
      mktRows
    );

    // ═══════════════════════════════════════════════════════════════
    // 九、内部 KPI
    // ═══════════════════════════════════════════════════════════════
    y = checkPage(doc, y + 30, 250);
    y = sectionHeader(doc, F, y, "九", "建议内部国际公采准备 KPI", "9. Recommended Internal Readiness KPIs");

    const kpiRows = report.kpis.items.map(k => [k.area, k.day30, k.day60, k.day90, k.owner]);
    y = drawTable(
      { x: lx, y, width: pw, colWidths: [70, 100, 100, 100, pw - 370], doc, font: F, fontSize: 7, rowHeight: 18 },
      ["KPI模块", "30天", "60天", "90天", "责任建议"],
      kpiRows
    );

    // ═══════════════════════════════════════════════════════════════
    // 十、90天行动计划
    // ═══════════════════════════════════════════════════════════════
    y = checkPage(doc, y + 30, 150);
    y = sectionHeader(doc, F, y, "十", "90天国际公采能力提升行动计划", "10. 90-Day International Procurement Readiness Roadmap");

    const rmRows = report.roadmap.phases.map(p => [p.days, p.actions, p.deliverables, p.acceptance]);
    y = drawTable(
      { x: lx, y, width: pw, colWidths: [60, 140, 100, pw - 300], doc, font: F, fontSize: 7, rowHeight: 20 },
      ["阶段 / Phase", "重点工作 / Key Actions", "核心输出 / Deliverables", "完成标准 / Acceptance"],
      rmRows
    );

    // ═══════════════════════════════════════════════════════════════
    // 十一、综合结论
    // ═══════════════════════════════════════════════════════════════
    y = checkPage(doc, y + 30, 300);
    y = sectionHeader(doc, F, y, "十一", "综合诊断结论", "11. Overall Diagnostic Conclusion");

    // 等级标签（带颜色）
    const gc = report.conclusion.grade === "A" ? GREEN : report.conclusion.grade === "B" ? AMBER : RED;
    doc.save();
    doc.roundedRect(lx, y, 80, 50, 6).fill(gc);
    doc.font(F).fontSize(24).fillColor(WHITE);
    doc.text(report.conclusion.grade, lx, y + 5, { width: 80, align: "center" });
    doc.fontSize(10);
    doc.text(`${report.conclusion.score} 分`, lx, y + 32, { width: 80, align: "center" });
    doc.restore();

    const concRows = [
      ["综合评分 / Overall Score", `${report.conclusion.score}/100`],
      ["标准能力等级 / Standard Rating", `${report.conclusion.grade} / ${report.conclusion.grade === "A" ? "Executive（执行级）" : report.conclusion.grade === "B" ? "Preparatory（准备级）" : "Foundational（基础级）"}`],
      ["当前定位 / Current Position", report.conclusion.position],
      ["核心优势 / Key Strengths", report.conclusion.strengths],
      ["首要短板 / Priority Gaps", report.conclusion.gaps],
      ["建议进入阶段 / Recommended Stage", report.conclusion.recommendedStage],
      ["推荐切入产品 / Recommended Products", report.conclusion.recommendedProducts],
      ["推荐投标方式 / Recommended Route", report.conclusion.recommendedRoute],
    ];
    y += 60;
    y = drawTable(
      { x: lx, y, width: pw, colWidths: [100, pw - 100], doc, font: F, fontSize: 8, rowHeight: 20 },
      ["结论项 / Conclusion", "诊断结果 / Diagnostic Result"],
      concRows
    );

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

    // ═══════════════════════════════════════════════════════════════
    // 附录：核心评分矩阵
    // ═══════════════════════════════════════════════════════════════
    y = checkPage(doc, y + 30, 200);
    doc.font(F).fontSize(12).fillColor(NAVY);
    doc.text("附录：核心评分矩阵 / Appendix: Core Readiness Scoring Matrix", lx, y, { width: pw });
    y += 18;

    const mHeaders = ["No.", "评估维度", "权重", "评分", "加权分", "证据来源", "状态"];
    const mCols = [25, 160, 40, 40, 50, 55, pw - 370];
    const mRows = scoring.dimensions.map(d => [
      String(d.no), d.name, String(d.weight), `${d.rawScore}/5`,
      `${d.weightedScore}`, d.evidenceSource, d.needsManualReview ? "需补充" : "OK"
    ]);
    mRows.push(["", "总计 / TOTAL", "100", "", `${scoring.totalScore}`, "", scoring.grade]);
    y = drawTable(
      { x: lx, y, width: pw, colWidths: mCols, doc, font: F, fontSize: 7, rowHeight: 18 },
      mHeaders, mRows
    );

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

    // ═══════════════════════════════════════════════════════════════
    // 十二、免责声明
    // ═══════════════════════════════════════════════════════════════
    y = checkPage(doc, y + 40, 60);
    y += 10;
    doc.font(F).fontSize(7).fillColor(GRAY);
    doc.text(`免责声明：${report.disclaimer.zh}`, lx, y, { width: pw });
    y += 14;
    doc.text(`Disclaimer: ${report.disclaimer.en}`, lx, y, { width: pw });

    // 底部
    drawPageFooter(doc, F);

    doc.end();
  });
}
