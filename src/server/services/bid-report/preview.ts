/**
 * bid-report 纯文本预览生成
 * Preview text generation for bid reports
 */
import "server-only";
import { PLATFORMS, INDUSTRY_MAP, safe, type Row } from "./constants";

/** 报告预览段落 */
export interface ReportPreviewSection {
  heading: string;
  body: string;
}

/**
 * 估算完整 Word 报告的总字符数（用于前端预览百分比计算）。
 * 镜像 buildBidReportDocx 的章节结构，累加各章节文本长度。
 */
export function estimateFullReportCharCount(row: Row): number {
  const agencyFull = safe(row.agency_full || row.agency);
  const platformKey = safe(row.source_platform);
  const platform = PLATFORMS[platformKey] || platformKey.toUpperCase();
  const reference = safe(row.reference);
  const title = safe(row.title);
  const unspscCodes = Array.isArray(row.unspsc_codes) ? row.unspsc_codes : [];
  const aiProducts = Array.isArray(row.ai_products) ? row.ai_products : [];
  const aiAnalysis = row.ai_analysis && typeof row.ai_analysis === "object" ? row.ai_analysis : {};
  const documents = Array.isArray(row.documents) ? row.documents : [];
  const externalLinks = Array.isArray(row.external_links) ? row.external_links : [];
  const contacts = Array.isArray(row.contacts) ? row.contacts : [];
  const asText = (v: any) => (Array.isArray(v) ? v.join("\n") : String(v ?? ""));
  let total = 0;

  // 封面
  total += safe(agencyFull || platform).length + title.length +
    (reference ? `招标编号：${reference}  |  ` : "").length + "深度技术与商务分析报告".length;

  // 一、项目基本信息
  total += "一、 项目基本信息与关键时间矩阵 (Tender Overview & Key Timeline)".length +
    "1.1 核心招投标身份信息".length;
  const infoFields = [
    ["采购业主 (Buying Agency)", agencyFull || platform],
    ["平台来源", platform],
    ["标案项目名称 (Project Title)", title],
    ["招标类型 (Notice Type)", safe(row.notice_type)],
    ["注册级别要求 (Registration Level)", safe(row.registration_level)],
    ["行业 (Industry)", safe(INDUSTRY_MAP[safe(row.industry)] ?? row.industry)],
  ];
  for (const [label, value] of infoFields) total += label.length + 2 + value.length;
  const unspscStr = unspscCodes.map((c: any) => safe(c?.code) + (c?.name ? ` — ${c.name}` : "")).filter(Boolean).join("；");
  if (unspscStr) total += "UNSPSC 编码分类".length + 2 + unspscStr.length;
  if (safe(row.product_code)) total += "产品编码".length + 2 + safe(row.product_code).length;
  total += `国际贸易条款 (Incoterms)：${safe(row.incoterms) || "未注明"}`.length;
  total += "1.2 时间节点与响应周期".length;
  total += "标案发布日期 (Publication Date)".length + 2 + safe(row.published_date).length;
  total += "标书截止递交时间 (Deadline)".length + 2 + safe(row.deadline).length;
  total += "截止时区".length + 2 + safe(row.deadline_timezone).length;
  total += "预估合同价值 (Estimated Value)".length + 2 + safe(row.estimated_value).length;
  if (safe(row.source_url)) total += `原始招标链接：${row.source_url}`.length;

  // 二、投标内容概览
  total += "二、 投标内容概览 (Bid Overview)".length;
  const bidOverview = safe(row.bid_overview);
  total += (bidOverview && bidOverview !== "-" ? bidOverview : safe(row.description)).length;
  if (safe(row.description_cn)) total += "2.1 采购描述（中文）".length + safe(row.description_cn).length;
  if (safe(row.description_other)) total += "2.2 采购描述（其他语言）".length + safe(row.description_other).length;

  // 三、采购清单与工程量表
  total += "三、 采购清单与工程量表 (Bill of Quantities - BoQ)".length;
  if (aiProducts.length > 0) {
    total += "业主本次招标要求采购的核心组件，所有标项必须作为一个完整的技术方案整体响应。".length;
    for (const p of aiProducts) {
      const name = typeof p === "string" ? p : safe(p?.name || p?.product);
      const scope = typeof p === "object" && p !== null ? safe(p.scope || p.description || p.spec) : "";
      total += name.length + scope.length + 20;
    }
  } else {
    total += "本标案暂无结构化工程量清单数据，以下为采购描述内容：".length + safe(row.description).length;
  }

  // 四、严格技术规格深度解构
  total += "四、 严格技术规格深度解构 (Strict Technical Specifications)".length;
  const techHurdles = safe(row.technical_hurdles);
  if (techHurdles && techHurdles !== "-") total += techHurdles.length;
  if (aiAnalysis.summary) total += "AI 深度分析摘要".length + asText(aiAnalysis.summary).length;
  if (aiAnalysis.tech_specs) total += "技术规格解析".length + asText(aiAnalysis.tech_specs).length;
  if (aiAnalysis.risks) {
    const risks = Array.isArray(aiAnalysis.risks) ? aiAnalysis.risks : [aiAnalysis.risks];
    total += "主要风险点".length + risks.reduce((sum: number, r: any) => sum + (typeof r === "string" ? r.length : JSON.stringify(r).length) + 2, 0);
  }
  if (aiAnalysis.advantages) {
    const adv = Array.isArray(aiAnalysis.advantages) ? aiAnalysis.advantages : [aiAnalysis.advantages];
    total += "竞争优势建议".length + adv.reduce((sum: number, a: any) => sum + (typeof a === "string" ? a.length : JSON.stringify(a).length) + 2, 0);
  }
  if (documents.length > 0) {
    total += "4.1 招标附件文件清单".length;
    for (const d of documents) total += safe(d?.name || d?.title).length + safe(d?.url || d?.href).length + 6;
  }
  if (externalLinks.length > 0) {
    total += "4.2 外部参考链接".length;
    for (const l of externalLinks) total += safe(l?.name || l?.title || l?.url).length + safe(l?.url || l?.href).length + 6;
  }

  // 五、强制性资格审查（固定模板 ~1200 字符 + 动态字段）
  total += "五、 强制性资格审查与标书文件清单 (Mandatory Documentation Checklist)".length + 1200;
  const supplierCond = safe(row.supplier_conditions);
  if (supplierCond && supplierCond !== "-") total += "5.1 供应商投标条件".length + supplierCond.length;
  const eligibility = safe(row.eligibility);
  if (eligibility && eligibility !== "-") total += "5.2 资格要求（Eligibility Requirements）".length + eligibility.length;

  // 六、电子投递规范（固定模板 ~600 字符 + 动态字段）
  total += "六、 电子投递规范与标书递交要求 (Submission Logistics & Rules)".length + 600;
  if (contacts.length > 0) {
    total += "6.1 发标方联系方式".length;
    for (const c of contacts) total += safe(c?.name).length + safe(c?.title).length + safe(c?.email).length + safe(c?.phone).length + 20;
  }
  if (safe(row.training_link)) total += "6.2 研修班关联点".length + safe(row.training_link).length;

  // 七、推进建议（~600 字符固定 + 备注）
  total += "七、 针对当前阶段的推进建议".length + 600;
  if (safe(row.remark)) total += "内部备注".length + safe(row.remark).length;

  return total;
}

/**
 * 生成报告预览内容：仅保留 Word 报告中「2.1 采购描述」一章，
 * 其余章节不再随预览接口下发。
 */
export function buildBidReportPreviewText(row: Row, lang: string = "zh"): ReportPreviewSection[] {
  if (lang === "zh") {
    const descriptionCn = safe(row.description_cn);
    if (descriptionCn) return [{ heading: "2.1 采购描述（中文）", body: descriptionCn }];
  }
  const description = safe(row.description);
  if (description) return [{ heading: "2.1 Procurement Description", body: description }];
  return [];
}
