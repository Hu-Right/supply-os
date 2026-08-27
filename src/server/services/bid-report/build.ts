/**
 * bid-report 主构建函数
 * Main buildBidReportDocx function
 */
import "server-only";
import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  Table,
  TextRun,
} from "docx";
import { PLATFORMS, INDUSTRY_MAP, SONG, safe, type Row } from "./constants";
import { title0, h1, h2, line, bodyText, bullet, kvTable, boqTable, aiAnalysisBlocks, formatNow } from "./builders";

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
      children: [new TextRun({ text: title, font: SONG, size: 28, bold: true, color: "1F3864" })],
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
