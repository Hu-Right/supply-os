/**
 * 供应商就绪度评估报告 PDF 生成服务
 * Supplier Readiness Scorecard PDF Generator
 *
 * @module src/lib/services/supplier-readiness-pdf
 * @description 使用 pdfkit 生成与「9-供应商就绪度评分表」格式对齐的 PDF 报告。
 *              服务端专用（import "server-only"），输出为 Buffer。
 */
import "server-only";
import path from "path";
import PDFDocument from "pdfkit";
import type { ScoringResult, QualificationScoreInput } from "@/features/procurement/utils/scoringEngine";
import { scoreQualification } from "@/features/procurement/utils/scoringEngine";

// ── 类型 ──

export interface PdfReportInput extends QualificationScoreInput {
  /** 记录 ID（用于报告编号） */
  id?: number;
  /** 评估日期（默认今天） */
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

// ── 字体路径 ──

function getFontPath(): string {
  // 优先尝试项目内 public/fonts/，再尝试 src/lib/fonts/
  const candidates = [
    path.join(process.cwd(), "public", "fonts", "SimHei.ttf"),
    path.join(process.cwd(), "src", "lib", "fonts", "SimHei.ttf"),
  ];
  for (const p of candidates) {
    try {
      require("fs").accessSync(p);
      return p;
    } catch { /* try next */ }
  }
  throw new Error("SimHei.ttf font not found in public/fonts/ or src/lib/fonts/");
}

// ── 辅助：绘制表格 ──

interface TableOptions {
  x: number;
  y: number;
  width: number;
  colWidths: number[];
  rowHeight: number;
  headerHeight?: number;
  doc: PDFKit.PDFDocument;
  fontName: string;
  fontSize?: number;
  headerBg?: string;
  headerFg?: string;
}

function drawTable(
  opts: TableOptions,
  headers: string[],
  rows: string[][],
): number {
  const { x, width, colWidths, rowHeight, doc, fontName, fontSize = 8 } = opts;
  const headerHeight = opts.headerHeight || rowHeight + 4;
  const headerBg = opts.headerBg || NAVY;
  const headerFg = opts.headerFg || WHITE;
  let y = opts.y;

  // ── 表头 ──
  doc.save();
  doc.rect(x, y, width, headerHeight).fill(headerBg);
  doc.font(fontName).fontSize(fontSize).fillColor(headerFg);
  let cx = x;
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], cx + 4, y + 4, {
      width: colWidths[i] - 8,
      height: headerHeight - 8,
      align: "center",
      lineBreak: false,
    });
    cx += colWidths[i];
  }
  doc.restore();
  y += headerHeight;

  // ── 数据行 ──
  for (let r = 0; r < rows.length; r++) {
    const bg = r % 2 === 0 ? WHITE : LIGHT_BG;

    // 检查是否需要换页
    if (y + rowHeight > doc.page.height - 50) {
      doc.addPage();
      y = 50;
    }

    doc.save();
    doc.rect(x, y, width, rowHeight).fill(bg);
    doc.rect(x, y, width, rowHeight).stroke(LIGHT_GRAY);
    doc.font(fontName).fontSize(fontSize).fillColor(DARK);

    cx = x;
    for (let i = 0; i < rows[r].length; i++) {
      // 画竖线
      if (i > 0) {
        doc.save();
        doc.moveTo(cx, y).lineTo(cx, y + rowHeight).stroke(LIGHT_GRAY);
        doc.restore();
      }
      doc.text(rows[r][i], cx + 4, y + 4, {
        width: colWidths[i] - 8,
        height: rowHeight - 8,
        align: i === 0 ? "left" : "center",
        lineBreak: false,
      });
      cx += colWidths[i];
    }
    doc.restore();
    y += rowHeight;
  }

  return y;
}

// ── 辅助：绘制进度条 ──

function drawScoreBar(
  doc: PDFKit.PDFDocument,
  fontName: string,
  x: number,
  y: number,
  score: number,
  maxScore: number,
  barWidth: number,
  barHeight: number,
): void {
  const ratio = Math.min(score / maxScore, 1);
  const fillWidth = barWidth * ratio;

  // 背景条
  doc.save();
  doc.roundedRect(x, y, barWidth, barHeight, 2).fill(LIGHT_GRAY);

  // 填充条（按分数着色）
  const color = ratio >= 0.8 ? GREEN : ratio >= 0.6 ? AMBER : RED;
  if (fillWidth > 0) {
    doc.roundedRect(x, y, fillWidth, barHeight, 2).fill(color);
  }
  doc.restore();

  // 分数文字
  doc.font(fontName).fontSize(8).fillColor(DARK);
  doc.text(`${score}/${maxScore}`, x + barWidth + 6, y - 1, { width: 40, align: "left" });
}

// ── 主函数：生成 PDF Buffer ──

export async function generateReadinessPdf(input: PdfReportInput): Promise<Buffer> {
  const result = scoreQualification(input);
  const fontPath = getFontPath();
  const FONT = "SimHei";

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      bufferPages: true,
      info: {
        Title: "供应商就绪度评估报告",
        Author: "国际采购供应链平台",
        Subject: `供应商就绪度评分 - ${input.company_name}`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // 注册中文字体
    doc.registerFont(FONT, fontPath);

    const pageWidth = doc.page.width - 100; // 减去左右 margin
    const leftX = 50;

    // ═══════════════════════════════════════════════════════════
    // 第 1 页：封面 + 企业基本信息
    // ═══════════════════════════════════════════════════════════

    // ── 标题区 ──
    doc.save();
    doc.rect(0, 0, doc.page.width, 120).fill(NAVY);
    doc.font(FONT).fontSize(24).fillColor(WHITE);
    doc.text("供应商就绪度评估报告", 50, 30, { align: "center", width: pageWidth });
    doc.fontSize(12).fillColor("#94A3B8");
    doc.text("SUPPLIER READINESS SCORECARD", 50, 65, { align: "center", width: pageWidth });
    doc.fontSize(9).fillColor("#64748B");
    doc.text("培训现场分级与会后跟进工具 / On-site classification and post-training follow-up tool", 50, 88, { align: "center", width: pageWidth });
    doc.restore();

    let y = 140;

    // ── 企业基本信息 ──
    doc.font(FONT).fontSize(14).fillColor(NAVY);
    doc.text("企业与评估信息 / COMPANY & ASSESSMENT INFORMATION", leftX, y);
    y += 25;

    const infoRows = [
      ["企业名称", input.company_name || "-", "行业", input.industry.join(", ") || "-"],
      ["企业官网", input.company_website || "-", "主营产品", input.main_product || "-"],
      ["成立年份", input.founding_year || "-", "企业规模", input.employee_count || "-"],
      ["出口规模", input.export_scale || "-", "UNGM状态", input.ungm_status || "-"],
      ["英文团队", input.english_team || "-", "账期接受", input.payment_terms || "-"],
      ["投标意愿", input.bid_willingness || "-", "联系方式", input.contact_info || "-"],
      ["评估日期", input.assessDate || new Date().toISOString().slice(0, 10), "报告编号", input.id ? `QR-${String(input.id).padStart(6, "0")}` : "-"],
    ];

    const infoColWidths = [80, pageWidth / 2 - 80, 80, pageWidth / 2 - 80];
    y = drawTable(
      { x: leftX, y, width: pageWidth, colWidths: infoColWidths, rowHeight: 22, doc, fontName: FONT, fontSize: 9 },
      ["字段", "值", "字段", "值"],
      infoRows,
    );

    y += 20;

    // ── 评分方法说明 ──
    doc.font(FONT).fontSize(14).fillColor(NAVY);
    doc.text("评分方法 / SCORING METHOD", leftX, y);
    y += 22;

    const methodRows = [
      ["0 分", "无能力或无证据", "No capability/evidence"],
      ["1-2 分", "起步阶段，重大缺口", "Early stage, major gaps"],
      ["3-4 分", "基本可用，但需补强", "Usable, needs strengthening"],
      ["5 分", "已验证、可立即调用", "Verified and immediately usable"],
    ];
    const methodColWidths = [60, pageWidth / 2 - 30, pageWidth / 2 - 30];
    y = drawTable(
      { x: leftX, y, width: pageWidth, colWidths: methodColWidths, rowHeight: 20, doc, fontName: FONT, fontSize: 9 },
      ["评分", "含义（中文）", "含义（英文）"],
      methodRows,
    );

    // ═══════════════════════════════════════════════════════════
    // 第 2 页：核心评分矩阵
    // ═══════════════════════════════════════════════════════════
    doc.addPage();
    y = 50;

    doc.font(FONT).fontSize(14).fillColor(NAVY);
    doc.text("核心评分矩阵 / CORE READINESS SCORING MATRIX", leftX, y);
    y += 8;
    doc.font(FONT).fontSize(9).fillColor(GRAY);
    doc.text("评分 = (原始评分 ÷ 5) × 权重", leftX, y + 14, { width: pageWidth });
    y += 28;

    // 评分矩阵表
    const matrixHeaders = ["No.", "评估维度", "权重", "评分", "加权分", "证据来源", "状态"];
    const matrixColWidths = [30, 180, 45, 45, 55, 60, pageWidth - 415];
    const matrixRows = result.dimensions.map((d) => [
      String(d.no),
      d.name,
      String(d.weight),
      `${d.rawScore}/5`,
      `${d.weightedScore}`,
      d.evidenceSource,
      d.needsManualReview ? "需补充" : "OK",
    ]);

    // 总计行
    matrixRows.push([
      "",
      "总计 / TOTAL",
      "100",
      "",
      `${result.totalScore}`,
      "",
      result.grade,
    ]);

    y = drawTable(
      {
        x: leftX, y, width: pageWidth,
        colWidths: matrixColWidths,
        rowHeight: 22,
        headerHeight: 26,
        doc, fontName: FONT, fontSize: 8,
        headerBg: NAVY,
      },
      matrixHeaders,
      matrixRows,
    );

    y += 20;

    // ── 各维度得分条 ──
    doc.font(FONT).fontSize(14).fillColor(NAVY);
    doc.text("各维度得分概览", leftX, y);
    y += 22;

    for (const d of result.dimensions) {
      if (y > doc.page.height - 80) {
        doc.addPage();
        y = 50;
      }
      // 维度名称
      doc.font(FONT).fontSize(9).fillColor(DARK);
      doc.text(`${d.no}. ${d.name}`, leftX, y, { width: 300 });
      doc.text(`${d.weightedScore}/${d.weight}`, leftX + 310, y, { width: 50, align: "right" });
      y += 14;

      // 进度条
      drawScoreBar(doc, FONT, leftX + 10, y, d.rawScore, 5, 300, 10);
      y += 18;

      // 评分依据
      doc.font(FONT).fontSize(7).fillColor(GRAY);
      const basisText = d.needsManualReview ? `[需人工补充] ${d.scoringBasis}` : d.scoringBasis;
      doc.text(basisText, leftX + 10, y, { width: pageWidth - 20 });
      y += 16;
    }

    // ═══════════════════════════════════════════════════════════
    // 第 3 页：即时结论 + 能力缺口 + 准入决定
    // ═══════════════════════════════════════════════════════════
    doc.addPage();
    y = 50;

    // ── 即时结论 ──
    doc.font(FONT).fontSize(14).fillColor(NAVY);
    doc.text("即时结论 / IMMEDIATE RESULT", leftX, y);
    y += 25;

    // 等级大标签
    const gradeColor = result.grade === "A" ? GREEN : result.grade === "B" ? AMBER : RED;
    doc.save();
    doc.roundedRect(leftX, y, 120, 60, 8).fill(gradeColor);
    doc.font(FONT).fontSize(28).fillColor(WHITE);
    doc.text(result.grade, leftX, y + 5, { width: 120, align: "center" });
    doc.fontSize(10);
    doc.text(`${result.totalScore} 分`, leftX, y + 38, { width: 120, align: "center" });
    doc.restore();

    // 等级说明
    doc.font(FONT).fontSize(12).fillColor(DARK);
    doc.text(result.gradeLabel, leftX + 140, y + 8, { width: 300 });
    doc.font(FONT).fontSize(10).fillColor(GRAY);
    doc.text(result.gradePath, leftX + 140, y + 28, { width: 300 });
    y += 75;

    // 覆盖规则提示
    if (result.overrideGateTriggered) {
      doc.save();
      doc.roundedRect(leftX, y, pageWidth, 30, 4).fill("#FEF2F2");
      doc.font(FONT).fontSize(9).fillColor(RED);
      doc.text(`⚠ 覆盖规则触发：${result.overrideGateReason}`, leftX + 10, y + 10, { width: pageWidth - 20 });
      doc.restore();
      y += 40;
    }

    // ── 关键能力缺口 ──
    y += 10;
    doc.font(FONT).fontSize(14).fillColor(NAVY);
    doc.text("关键能力缺口（Top 5）/ TOP CAPABILITY GAPS", leftX, y);
    y += 22;

    const gapHeaders = ["No.", "能力缺口", "优先级", "当前评分"];
    const gapColWidths = [35, pageWidth - 180, 70, 75];
    const gapRows = result.topGaps.map((g, i) => {
      const dim = result.dimensions.find((d) => d.name === g.dimension);
      return [
        String(i + 1),
        g.dimension,
        g.priority,
        `${dim?.rawScore ?? "-"}/5`,
      ];
    });

    y = drawTable(
      {
        x: leftX, y, width: pageWidth,
        colWidths: gapColWidths,
        rowHeight: 22,
        doc, fontName: FONT, fontSize: 9,
        headerBg: "#7C3AED",
      },
      gapHeaders,
      gapRows,
    );

    // ── 投标准入决定 ──
    y += 25;
    if (y > doc.page.height - 200) {
      doc.addPage();
      y = 50;
    }

    doc.font(FONT).fontSize(14).fillColor(NAVY);
    doc.text("投标准入决定 / BID-ENTRY DECISION", leftX, y);
    y += 22;

    const decisionRows = [
      ["最终等级", result.grade],
      ["总分", `${result.totalScore} / 100`],
      ["覆盖规则触发", result.overrideGateTriggered ? "是" : "否"],
      ["建议路径", result.gradePath],
      ["评估日期", input.assessDate || new Date().toISOString().slice(0, 10)],
    ];
    const decisionColWidths = [120, pageWidth - 120];
    y = drawTable(
      {
        x: leftX, y, width: pageWidth,
        colWidths: decisionColWidths,
        rowHeight: 22,
        doc, fontName: FONT, fontSize: 10,
        headerBg: NAVY,
      },
      ["项目", "内容"],
      decisionRows,
    );

    // ── 页脚：评分锚点摘要 ──
    y += 25;
    if (y > doc.page.height - 180) {
      doc.addPage();
      y = 50;
    }

    doc.font(FONT).fontSize(14).fillColor(NAVY);
    doc.text("评分锚点摘要 / SCORING ANCHORS SUMMARY", leftX, y);
    y += 22;

    // 每个维度一行简要锚点
    const anchorRows = result.dimensions.map((d) => [
      `${d.no}`,
      d.name.length > 14 ? d.name.slice(0, 14) + "…" : d.name,
      `${d.rawScore}/5`,
      d.scoringBasis.length > 30 ? d.scoringBasis.slice(0, 30) + "…" : d.scoringBasis,
    ]);

    const anchorColWidths = [25, 130, 40, pageWidth - 195];
    drawTable(
      {
        x: leftX, y, width: pageWidth,
        colWidths: anchorColWidths,
        rowHeight: 20,
        doc, fontName: FONT, fontSize: 8,
        headerBg: GRAY,
      },
      ["#", "维度", "评分", "依据"],
      anchorRows,
    );

    // ── 底部声明 ──
    const pageHeight = doc.page.height;
    doc.font(FONT).fontSize(7).fillColor(GRAY);
    doc.text(
      '本报告由国际采购供应链平台自动生成，基于企业填写的初筛表单数据。标注「需人工补充」的维度建议由评估师进一步验证。',
      leftX,
      pageHeight - 40,
      { width: pageWidth, align: "center" },
    );
    doc.text(
      "This report is auto-generated. Dimensions marked as \"needs manual review\" should be further verified by an assessor.",
      leftX,
      pageHeight - 28,
      { width: pageWidth, align: "center" },
    );

    doc.end();
  });
}
