/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 中文版订单拆解报告（Word）生成服务
 * Chinese bid breakdown report (.docx) builder
 *
 * @description 按 CRM 侧 PHP BidReportService（生成报告.txt）的章节结构与样式 1:1 移植：
 *              封面 → 一、基本信息与时间矩阵 → 二、投标内容概览 → 三、BoQ 工程量表 →
 *              四、技术规格深度解构 → 五、强制性资格清单 → 六、递交规范 → 七、推进建议。
 *              输入为 crm_bid_notices 行 + 合格 crm_bid_opportunities 行（可含 JSON 字符串
 *              字段，内部自行解码），输出 docx Buffer；纯排版无副作用，磁盘缓存由路由层负责。
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { safeJson, preferValue } from "../utils/json";

// ── 平台标签映射（与 PHP 版 PLATFORMS 一致）──
const PLATFORMS: Record<string, string> = {
  ungm: "UNGM (ungm.org)",
  undp: "UNDP Procurement",
  unops: "UNOPS eSourcing",
  wfp: "WFP eSourcing",
  unicef: "UNICEF Supply Division",
  who: "WHO eTendering",
  worldbank: "World Bank",
  dgmarket: "DG Market",
  idb: "IDB (Americas)",
  afdb: "AfDB",
  adb: "ADB",
  ted: "TED (EU)",
  sam: "SAM.gov (US Federal)",
  other: "其他",
};

// ── 行业标签映射（与 PHP 版 INDUSTRY_MAP 一致）──
const INDUSTRY_MAP: Record<string, string> = {
  agriculture: "农业/粮食",
  building: "建筑/基础设施",
  chemicals: "化工/材料",
  education: "教育/培训",
  electrical: "电气/电子",
  engineering: "工程/技术",
  food: "食品/营养",
  furniture: "家具/办公",
  it: "信息技术",
  laboratory: "实验室/检测",
  logistics: "物流/仓储",
  medical: "医疗/卫生",
  printing: "印刷/出版",
  safety: "安全/防护",
  shelter: "庇护所/住房",
  textile: "纺织/服装",
  vehicles: "车辆/运输",
  water: "水务/环境",
  other: "其他",
};

// ── 字体 / 颜色常量（PhpWord 样式对照）──
const SONG = { ascii: "宋体", eastAsia: "宋体", hAnsi: "宋体" };
const HEI = { ascii: "黑体", eastAsia: "黑体", hAnsi: "黑体" };
const NAVY = "1F3864";
const BLUE2 = "2E74B5";
const GREEN3 = "375623";
const TABLE_BLUE = "2E4099";
const BORDER_GREY = "D8D8D8";

type Row = Record<string, any>;

/** 安全字符串（对应 PHP safe()）：null/false/undefined 归空串 */
function safe(v: unknown): string {
  if (v === null || v === undefined || v === false || v === "") return "";
  return String(v);
}

/** 对象型 JSON 字段解码（ai_analysis 等）：对象直通、字符串解析、其余回退 {} */
function safeObj(value: any): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      /* 忽略坏 JSON */
    }
  }
  return {};
}

// ── 段落构件（对应 PhpWord addTitleStyle / addBodyText / addBulletText）──

/** 封面主标题（Title 0：黑体 18 加粗 居中） */
function title0(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
    children: [new TextRun({ text, font: HEI, size: 36, bold: true, color: NAVY })],
  });
}

/** 一级章节（黑体 14 加粗） */
function h1(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 80 },
    children: [new TextRun({ text, font: HEI, size: 28, bold: true, color: NAVY })],
  });
}

/** 二级章节（黑体 12 加粗） */
function h2(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 160, after: 60 },
    children: [new TextRun({ text, font: HEI, size: 24, bold: true, color: BLUE2 })],
  });
}

/** 三级章节（宋体 11 加粗） */
function h3(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 120, after: 40 },
    children: [new TextRun({ text, font: SONG, size: 22, bold: true, color: GREEN3 })],
  });
}

/** 普通行（宋体 11，可覆写样式） */
function line(text: string, opts: { size?: number; color?: string; bold?: boolean; italics?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; before?: number; after?: number } = {}): Paragraph {
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
function bodyText(text: string): Paragraph[] {
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
function bullet(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 20, after: 40 },
    indent: { left: 360, hanging: 180 },
    children: [new TextRun({ text, font: SONG, size: 22 })],
  });
}

const tableBorders = {
  top: { style: BorderStyle.SINGLE, size: 6, color: BORDER_GREY },
  bottom: { style: BorderStyle.SINGLE, size: 6, color: BORDER_GREY },
  left: { style: BorderStyle.SINGLE, size: 6, color: BORDER_GREY },
  right: { style: BorderStyle.SINGLE, size: 6, color: BORDER_GREY },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 6, color: BORDER_GREY },
  insideVertical: { style: BorderStyle.SINGLE, size: 6, color: BORDER_GREY },
} as const;

const cellMargins = { top: 80, bottom: 80, left: 80, right: 80 };

function cell(
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
function kvTable(rows: Array<[string, string]>): Table {
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
function boqTable(products: any[]): Table {
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
function aiAnalysisBlocks(aiAnalysis: Record<string, any>): Array<Paragraph | Table> {
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
function formatNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}年${pad(d.getMonth() + 1)}月${pad(d.getDate())}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 报告数据行：notice 与合格 opportunity 字段合并后的扁平结构。
 * opportunity 字段优先（与 normalizeNoticeDetailPayload 的 preferValue 口径一致）。
 */
export function mergeBidReportRow(notice: Row, opportunity: Row | null): Row {
  const opp = opportunity || {};
  return {
    id: opp.id ?? notice.id,
    reference: preferValue(opp.reference, notice.reference),
    title: preferValue(opp.title, notice.title),
    notice_type: preferValue(opp.notice_type, notice.notice_type),
    registration_level: preferValue(opp.registration_level, notice.registration_level),
    agency: preferValue(opp.agency, notice.agency),
    agency_full: preferValue(opp.agency_full, notice.agency_full),
    source_platform: safe(opp.source_platform),
    industry: preferValue(opp.industry, notice.industry),
    incoterms: safe(opp.incoterms),
    published_date: preferValue(opp.published_date, notice.published_date),
    deadline: preferValue(opp.deadline, notice.deadline),
    deadline_timezone: safe(opp.deadline_timezone),
    estimated_value: preferValue(opp.estimated_value, notice.estimated_value),
    description: preferValue(opp.description, notice.description),
    description_cn: safe(opp.description_cn),
    description_other: safe(opp.description_other),
    bid_overview: safe(opp.bid_overview),
    supplier_conditions: safe(opp.supplier_conditions),
    eligibility: safe(opp.eligibility),
    technical_hurdles: safe(opp.technical_hurdles),
    training_link: safe(opp.training_link),
    remark: safe(opp.remark),
    product_code: safe(opp.product_code),
    source_url: safe(opp.source_url || notice.url),
    unspsc_codes: safeJson(preferValue(opp.unspsc_codes, notice.unspsc_codes)),
    ai_products: safeJson(opp.ai_products),
    ai_analysis: safeObj(opp.ai_analysis),
    documents: safeJson(preferValue(opp.documents, notice.documents)),
    external_links: safeJson(preferValue(opp.external_links, notice.external_links)),
    contacts: safeJson(preferValue(opp.contacts, notice.contacts)),
  };
}

/** 下载文件名（中文名 + reference/id 定位符） */
export function bidReportFileName(row: Row): string {
  const suffix = safe(row.reference) || `N${safe(row.id) || "0"}`;
  // 文件名清洗：去除 Windows / URL 敏感字符
  const cleaned = suffix.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 60);
  return `中文版订单拆解报告_${cleaned}.docx`;
}

/**
 * 生成中文版订单拆解报告
 * @param row mergeBidReportRow 产出的扁平数据行
 * @returns docx 文件 Buffer
 */
export async function buildBidReportDocx(row: Row): Promise<Buffer> {
  const agencyFull = safe(row.agency_full || row.agency);
  const platformKey = safe(row.source_platform);
  const platform = PLATFORMS[platformKey] || platformKey.toUpperCase();
  const reference = safe(row.reference);
  const title = safe(row.title);

  const children: Array<Paragraph | Table> = [];

  // ══════════ 封面 / 标题区 ══════════
  children.push(title0(agencyFull || platform));
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 80 },
      children: [new TextRun({ text: title, font: HEI, size: 28, bold: true, color: NAVY })],
    })
  );
  const refLine = (reference ? `招标编号：${reference}  |  ` : "") + "深度技术与商务分析报告";
  children.push(line(refLine, { color: "595959", align: AlignmentType.CENTER, after: 200 }));
  children.push(new Paragraph({ text: "" }));

  // ══════════ 一、项目基本信息与关键时间矩阵 ══════════
  children.push(h1("一、 项目基本信息与关键时间矩阵 (Tender Overview & Key Timeline)"));
  children.push(h2("1.1 核心招投标身份信息"));

  const infoRows: Array<[string, string]> = [
    ["采购业主 (Buying Agency)", agencyFull || platform],
    ["平台来源", platform],
    ["标案项目名称 (Project Title)", title],
    ["招标类型 (Notice Type)", safe(row.notice_type)],
    ["注册级别要求 (Registration Level)", safe(row.registration_level)],
    ["行业 (Industry)", safe(INDUSTRY_MAP[safe(row.industry)] ?? row.industry)],
  ];
  const unspscCodes = Array.isArray(row.unspsc_codes) ? row.unspsc_codes : [];
  const unspscStr = unspscCodes
    .map((c: any) => safe(c?.code) + (c?.name ? ` — ${c.name}` : ""))
    .filter(Boolean)
    .join("；");
  if (unspscStr) infoRows.push(["UNSPSC 编码分类", unspscStr]);
  if (safe(row.product_code)) infoRows.push(["产品编码", safe(row.product_code)]);

  children.push(line(`国际贸易条款 (Incoterms)：${safe(row.incoterms) || "未注明"}`, { after: 40 }));
  children.push(kvTable(infoRows));
  children.push(new Paragraph({ text: "" }));

  children.push(h2("1.2 时间节点与响应周期"));
  children.push(
    kvTable([
      ["标案发布日期 (Publication Date)", safe(row.published_date)],
      ["标书截止递交时间 (Deadline)", safe(row.deadline)],
      ["截止时区", safe(row.deadline_timezone)],
      ["预估合同价值 (Estimated Value)", safe(row.estimated_value)],
    ])
  );
  children.push(new Paragraph({ text: "" }));

  if (safe(row.source_url)) {
    children.push(line(`原始招标链接：${row.source_url}`, { size: 20, color: "1E9FFF" }));
  }

  // ══════════ 二、投标内容概览 ══════════
  children.push(h1("二、 投标内容概览 (Bid Overview)"));
  const bidOverview = safe(row.bid_overview);
  children.push(...bodyText(bidOverview && bidOverview !== "-" ? bidOverview : safe(row.description)));
  if (safe(row.description_cn)) {
    children.push(h2("2.1 采购描述（中文）"), ...bodyText(row.description_cn));
  }
  if (safe(row.description_other)) {
    children.push(h2("2.2 采购描述（其他语言）"), ...bodyText(row.description_other));
  }

  // ══════════ 三、采购清单与工程量表 (BoQ) ══════════
  children.push(h1("三、 采购清单与工程量表 (Bill of Quantities - BoQ)"));
  const aiProducts = Array.isArray(row.ai_products) ? row.ai_products : [];
  if (aiProducts.length > 0) {
    children.push(line("业主本次招标要求采购的核心组件，所有标项必须作为一个完整的技术方案整体响应。", { after: 80 }));
    children.push(boqTable(aiProducts));
    children.push(new Paragraph({ text: "" }));
  } else {
    children.push(
      line("本标案暂无结构化工程量清单数据，以下为采购描述内容：", { italics: true, color: "888888", after: 40 })
    );
    children.push(...bodyText(safe(row.description)));
  }

  // ══════════ 四、严格技术规格深度解构 ══════════
  children.push(h1("四、 严格技术规格深度解构 (Strict Technical Specifications)"));
  const techHurdles = safe(row.technical_hurdles);
  if (techHurdles && techHurdles !== "-") {
    children.push(...bodyText(techHurdles));
  }
  const aiAnalysis = row.ai_analysis && typeof row.ai_analysis === "object" ? row.ai_analysis : {};
  if (Object.keys(aiAnalysis).length > 0) {
    children.push(...aiAnalysisBlocks(aiAnalysis));
  }
  const documents = Array.isArray(row.documents) ? row.documents : [];
  if (documents.length > 0) {
    children.push(h2("4.1 招标附件文件清单"));
    for (const doc of documents) {
      const docName = safe(doc?.name || doc?.title) || "文件";
      const docUrl = safe(doc?.url || doc?.href);
      children.push(bullet(`◆ ${docName}${docUrl ? `  (${docUrl})` : ""}`));
    }
  }
  const externalLinks = Array.isArray(row.external_links) ? row.external_links : [];
  if (externalLinks.length > 0) {
    children.push(h2("4.2 外部参考链接"));
    for (const link of externalLinks) {
      const linkName = safe(link?.name || link?.title || link?.url) || "链接";
      const linkUrl = safe(link?.url || link?.href);
      children.push(bullet(`◆ ${linkName}${linkUrl ? `  (${linkUrl})` : ""}`));
    }
  }

  // ══════════ 五、强制性资格审查与标书文件清单 ══════════
  children.push(h1("五、 强制性资格审查与标书文件清单 (Mandatory Documentation Checklist)"));
  children.push(
    line(
      "根据联合国采购准入规则，任何文件缺失或清晰度不合规均触发一票否决。所有文件须以英文提交（中文原件须附加盖投标公司公章的英文翻译件，并与原件合并为单一 PDF）。",
      { before: 40, after: 80 }
    )
  );
  const supplierCond = safe(row.supplier_conditions);
  if (supplierCond && supplierCond !== "-") {
    children.push(h2("5.1 供应商投标条件"), ...bodyText(supplierCond));
  }
  const eligibility = safe(row.eligibility);
  if (eligibility && eligibility !== "-") {
    children.push(h2("5.2 资格要求（Eligibility Requirements）"), ...bodyText(eligibility));
  }
  children.push(h2("5.3 第一类：技术资质与制造商实力档案"));
  const techDocs = [
    "制造商综合评述报告 (Manufacturer Profile)：工厂占地面积、日/月标准产能、技术团队架构及生产线全流程 QA/QC 管理体系；须附高清晰度实景车间照片。",
    "IMS 管理体系三标一体认证 (ISO Certifications)：ISO 9001（质量管理体系）/ ISO 14001（环境管理体系）/ ISO 45001（职业健康安全管理体系）。",
    "高清技术彩页与产品说明书 (Product Brochures)：所有物理、电气、软件及逻辑参数须与原始技术招标书条款进行\u201c一对一 (One-to-One)\u201d格式化矩阵对应。",
    "质量验证与测试报告 (Test Reports)：各系统对应的产品合规证书（COC）或质量证书（COQ）；出厂验收测试（FAT）记录或独立第三方实验室检测报告。",
    "官方全英文版操作与维护（O&M）技术手册。",
  ];
  for (const item of techDocs) children.push(bullet(`□ ${item}`));

  children.push(h2("5.4 第二类：商务合规与资信证明"));
  const bizDocs = [
    "企业法定营业执照 (Business License)：附最新国家工商企业登记证明文件（需加盖翻译章）。",
    "企业最高管理层身份证明 (Executive Identification)：公司常务董事（MD）或首席执行官（CEO）护照高清扫描件。",
    "过往履约历史与类似项目业绩 (Track Record)：提供过去连续5年内成功交付的类似项目综合清单，须注明客户名称、合同金额、联系方式，并附采购订单（PO）或完工验收证书。",
    "官方制造商授权书 (MAF)：若非直接制造工厂，须提交原厂针对本标案编号签发的官方授权书。",
  ];
  for (const item of bizDocs) children.push(bullet(`□ ${item}`));

  // ══════════ 六、电子投递规范与标书递交要求 ══════════
  children.push(h1("六、 电子投递规范与标书递交要求 (Submission Logistics & Rules)"));
  children.push(
    kvTable([
      ["唯一合规递交入口", "标书须通过官方采购门户（UNOPS Quantum Supplier Portal 或对应平台）在线提交，不接受邮件递交。"],
      [
        "Incoterms 与计价货币",
        `${safe(row.incoterms) || "请参考原始标书"}，价格须包含运输、卸货、安装、调试与培训全部费用，以美元（USD）计价。`,
      ],
      [
        "单次递交完整性要求",
        "技术标与商务标须作为完整方案一并提交，不可分拆递交；附件须直接上传至系统，严禁附带百度网盘、Google Drive 等外部链接。",
      ],
      ["邮件/平台主题命名规范", `须严格按照招标文件规定的参考编号格式标注，不得有任何多余字符。格式：${reference || "[标案编号]"}`],
    ])
  );
  children.push(new Paragraph({ text: "" }));

  const contacts = Array.isArray(row.contacts) ? row.contacts : [];
  if (contacts.length > 0) {
    children.push(h2("6.1 发标方联系方式"));
    for (const c of contacts) {
      let lineText = "";
      if (safe(c?.name)) lineText += `${c.name} `;
      if (safe(c?.title)) lineText += `(${c.title}) `;
      if (safe(c?.email)) lineText += `邮箱: ${c.email} `;
      if (safe(c?.phone)) lineText += `电话: ${c.phone}`;
      if (lineText.trim()) children.push(bullet(`◆ ${lineText.trim()}`));
    }
  }
  if (safe(row.training_link)) {
    children.push(h2("6.2 研修班关联点"), ...bodyText(row.training_link));
  }

  // ══════════ 七、针对当前阶段的推进建议 ══════════
  children.push(h1("七、 针对当前阶段的推进建议"));
  const suggestions = [
    "立即下载原始招标文件：通过招标页面链接下载完整标书，核实报价有效期天数、验收标准细节及付款条款。",
    "供应商注册核查：确认贵司在对应采购门户的注册状态与资质等级是否满足本标案要求，若未注册须立即完成注册流程。",
    "设备工厂对接：迅速向国内集成商/制造商调取相关技术彩页、IP防护等级认证文件，并逐条与技术要求比对。",
    `报价核算：商务团队按 ${safe(row.incoterms) || "DAP"} 条款（含运输、安装、调试）核算完整报价，剔除一切增值税。`,
    `截止时间跟踪：密切关注截止日期 ${safe(row.deadline)}，提前72小时完成文件准备并完成系统上传。`,
  ];
  suggestions.forEach((suggestion, i) => children.push(bullet(`${i + 1}. ${suggestion}`)));

  if (safe(row.remark)) {
    children.push(h2("内部备注"), ...bodyText(row.remark));
  }

  // ══════════ 页脚：生成时间 + 声明 ══════════
  children.push(new Paragraph({ text: "" }), new Paragraph({ text: "" }));
  children.push(
    line(`本报告由系统自动生成  |  生成时间：${formatNow()}  |  仅供内部参考使用，请勿对外传播`, {
      size: 18,
      color: "AAAAAA",
      italics: true,
      align: AlignmentType.CENTER,
    })
  );

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: SONG, size: 22 } },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
