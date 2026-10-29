/**
 * bid-report 数据合并与文件名生成
 * Row merging and file name generation
 */
import { safeJson, preferValue } from "../../utils/json";
import { safe, safeObj, type Row } from "./constants";

/**
 * 报告 data 行：公共字段以服务表/公告为准；只有商机标题和商机中文正文允许覆盖。
 * 商机侧 title / description_cn 优先，其余公共字段公告优先。
 */
export function mergeBidReportRow(notice: Row, opportunity: Row | null): Row {
  const opp = opportunity || {};
  return {
    id: opp.id ?? notice.id,
    reference: preferValue(notice.reference, opp.reference),
    title: preferValue(opp.title, notice.title),
    notice_type: preferValue(notice.notice_type, opp.notice_type),
    registration_level: preferValue(notice.registration_level, opp.registration_level),
    agency: preferValue(notice.agency, opp.agency),
    agency_full: preferValue(notice.agency_full, opp.agency_full),
    source_platform: safe(notice.source_platform || opp.source_platform),
    industry: preferValue(notice.industry, opp.industry),
    incoterms: safe(opp.incoterms),
    published_date: preferValue(notice.published_date, opp.published_date),
    deadline: preferValue(notice.deadline, opp.deadline),
    deadline_timezone: safe(notice.deadline_timezone || opp.deadline_timezone),
    estimated_value: preferValue(notice.estimated_value, opp.estimated_value),
    description: preferValue(notice.description, opp.description),
    description_cn: preferValue(opp.description_cn, notice.description_cn),
    description_other: safe(opp.description_other),
    bid_overview: safe(opp.bid_overview),
    supplier_conditions: safe(opp.supplier_conditions),
    eligibility: safe(opp.eligibility),
    technical_hurdles: safe(opp.technical_hurdles),
    training_link: safe(opp.training_link),
    remark: safe(opp.remark),
    source_url: preferValue(notice.source_url || notice.url, opp.source_url),
    // R5'（2026-10-14）：旧品类码快照列运行期不再 SELECT（notice-detail.repo / opportunities.repo
    // 两侧列清单均已剥），报告不再写那个字段。旧行如需重建那份快照，
    // 走收官留底（runtime/ 下的退役备份 dump，含逐行回灌语句）。
    ai_products: safeJson(opp.ai_products),
    ai_analysis: safeObj(opp.ai_analysis),
    documents: safeJson(preferValue(notice.documents, opp.documents)),
    external_links: safeJson(preferValue(notice.external_links, opp.external_links)),
    contacts: safeJson(preferValue(notice.contacts, opp.contacts)),
  };
}

/** 下载文件名（中文名 + reference/id 定位符） */
export function bidReportFileName(row: Row): string {
  const suffix = safe(row.reference) || `N${safe(row.id) || "0"}`;
  // 文件名清洗：去除 Windows / URL 敏感字符
  const cleaned = suffix.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 60);
  return `中文版订单拆解报告_${cleaned}.docx`;
}
