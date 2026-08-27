/**
 * bid-report 数据合并与文件名生成
 * Row merging and file name generation
 */
import "server-only";
import { safeJson, preferValue } from "../../utils/json";
import { safe, safeObj, type Row } from "./constants";

/**
 * 报告 data 行：notice 与合格 opportunity 字段合并后的扁平结构。
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
