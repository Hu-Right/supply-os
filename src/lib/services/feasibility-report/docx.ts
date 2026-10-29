/**
 * 投标可行性报告 —— Word 导出
 *
 * @module lib/services/feasibility-report/docx
 * @description 把报告 JSON 渲染成可交付的 .docx：结论 / 缺口 / 要求矩阵 / 待确认项 / 免责。
 *              字体与配色沿用 bid-report 的 SONG 常量，保持中文文档风格一致。
 */
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { SONG, HEI, NAVY, BLUE2, BORDER_GREY, TABLE_BLUE, safe } from "../bid-report/constants";
import type { FeasibilityReport, RuleStatus } from "./types";

const STATUS_TEXT: Record<RuleStatus, string> = {
  satisfied: "满足",
  partial: "部分满足",
  missing: "缺失",
  expired: "已过期",
  unknown: "待确认",
  not_applicable: "不适用",
};

const DECISION_TEXT = { go: "可投", no_go: "不建议投", conditional: "有条件可投" } as const;

function p(text: string, opts: { bold?: boolean; size?: number; color?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number } = {}): Paragraph {
  return new Paragraph({
    alignment: opts.align,
    spacing: { after: opts.after ?? 80 },
    children: [new TextRun({ text, font: SONG, size: opts.size ?? 22, bold: opts.bold, color: opts.color })],
  });
}

function h(text: string, level: 1 | 2): Paragraph {
  return new Paragraph({
    heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    spacing: { before: level === 1 ? 240 : 160, after: 80 },
    children: [new TextRun({ text, font: HEI, size: level === 1 ? 28 : 24, bold: true, color: level === 1 ? NAVY : BLUE2 })],
  });
}

function cell(text: string, opts: { bold?: boolean; fill?: string; width?: number } = {}): TableCell {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.fill ? { fill: opts.fill } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: [new TextRun({ text: safe(text), font: SONG, size: 20, bold: opts.bold })] })],
  });
}

function table(headers: string[], rows: string[][], widths?: number[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: "single", size: 4, color: BORDER_GREY },
      bottom: { style: "single", size: 4, color: BORDER_GREY },
      left: { style: "single", size: 4, color: BORDER_GREY },
      right: { style: "single", size: 4, color: BORDER_GREY },
      insideHorizontal: { style: "single", size: 2, color: BORDER_GREY },
      insideVertical: { style: "single", size: 2, color: BORDER_GREY },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((text, index) => cell(text, { bold: true, fill: TABLE_BLUE, width: widths?.[index] })),
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: row.map((text, index) => cell(text, { width: widths?.[index] })),
          }),
      ),
    ],
  });
}

export interface BuildFeasibilityDocxOptions {
  /** 公告标题（报告本身不存，导出时从公告补） */
  noticeTitle?: string | null;
  /** 导出时间（ISO），缺省 now */
  exportedAt?: string;
}

export async function buildFeasibilityReportDocx(
  report: FeasibilityReport,
  options: BuildFeasibilityDocxOptions = {},
): Promise<Buffer> {
  const generatedAt = report.meta.generatedAt.slice(0, 19).replace("T", " ");
  const exportedAt = (options.exportedAt ?? new Date().toISOString()).slice(0, 10);
  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: "投标可行性报告", font: HEI, size: 40, bold: true, color: NAVY })],
    }),
  );
  if (options.noticeTitle) {
    children.push(p(options.noticeTitle, { align: AlignmentType.CENTER, size: 24, color: BLUE2, after: 200 }));
  }
  children.push(
    p(
      `公告编号：${report.meta.noticePk}  企业编号：${report.meta.enterpriseId}  生成时间：${generatedAt}  规则版本：${report.meta.promptVersion}`,
      { size: 18, color: "666666" },
    ),
  );

  // 一、结论
  children.push(h("一、 结论", 1));
  children.push(
    p(
      `判定：${DECISION_TEXT[report.verdict.decision]}  综合评分：${Math.round(report.verdict.score * 100)} / 100  ` +
        `强制项 ${report.deterministic.rulesPassed} 项满足 / ${report.deterministic.rulesFailed} 项不满足 / ${report.deterministic.rulesUnknown} 项待确认`,
      { bold: true, size: 22 },
    ),
  );
  for (const reason of report.verdict.reasons) {
    children.push(p(`· ${reason.text}`, { size: 20 }));
  }

  // 二、资格与缺口
  children.push(h("二、 资格与缺口", 1));
  if (report.gaps.length === 0) {
    children.push(p("未发现缺口。"));
  } else {
    children.push(
      table(
        ["要求", "状态", "建议"],
        report.gaps.map((gap) => [gap.title, STATUS_TEXT[gap.status], gap.suggest]),
        [34, 14, 52],
      ),
    );
  }

  // 三、要求对照矩阵
  children.push(h("三、 要求对照矩阵", 1));
  if (report.matrix.length === 0) {
    children.push(p("暂无要求项。"));
  } else {
    children.push(
      table(
        ["要求", "企业现状", "判定"],
        report.matrix.map((row) => [row.requirement, row.capability, STATUS_TEXT[row.status]]),
        [44, 40, 16],
      ),
    );
  }

  // 四、待确认项
  children.push(h("四、 待确认项", 1));
  if (report.unknowns.length === 0) {
    children.push(p("无。"));
  } else {
    children.push(
      table(
        ["要求", "无法判定原因", "建议"],
        report.unknowns.map((item) => [item.title, item.reason, item.need]),
        [30, 40, 30],
      ),
    );
  }

  // 五、AI 建议
  children.push(h("五、 AI 建议（仅供参考，不作为判定依据）", 1));
  if (report.aiAdvice.length === 0) {
    children.push(p("本期报告未生成 AI 建议；确定性判定以上文规则结论为准。"));
  } else {
    for (const advice of report.aiAdvice) {
      children.push(p(`· ${advice.text}（置信度：${advice.confidence}）`, { size: 20 }));
    }
  }

  children.push(h("附：免责声明", 1));
  children.push(p(report.disclaimer, { size: 18, color: "666666" }));
  children.push(p(`导出日期：${exportedAt}`, { size: 18, color: "666666" }));

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: SONG, size: 22 } },
      },
    },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
