/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { safeJson, preferValue } from "../../utils/json";
import { normalizeContactRows, normalizeDocumentRows } from "../../utils/normalize";
import { normalizeUnspscCodes } from "../unspsc/index";
import { INTL_PROCUREMENT_COLUMNS, type IntlProcurementColumn } from "../../utils/notice-field-limits";

// Re-export 精选逻辑
export {
  FEATURED_NOTICE_EXISTS,
  findQualifiedOpportunityForNotice,
  refreshFeaturedColumn,
} from "./featured";

/**
 * 国际公共采购结构化字段透出：仅从机会行取（公告主表无这些列），
 * 无机会行时返回 null 值集合而非缺键，保证前端渲染不依赖字段存在性判断。
 * 列清单从 INTL_PROCUREMENT_COLUMNS 派生 —— 加列只改单一事实源，此处自动跟随。
 */
function buildIntlProcurement(opportunity?: Record<string, unknown> | null) {
  const out = {} as Record<IntlProcurementColumn, string | number | null>;
  for (const col of INTL_PROCUREMENT_COLUMNS) {
    const v = opportunity?.[col];
    out[col] = v === undefined || v === null ? null : (v as string | number);
  }
  return out;
}

export function normalizeNoticeDetailPayload(notice: any, unlock?: any, opportunity?: any) {
  const detailSource = opportunity ? "opportunity" : "notice";
  // 联系人只认结构化字段，无数据即为空，不从 description 文本猜测抽取
  const mergedContacts = normalizeContactRows(opportunity?.contacts, notice.contacts, notice.key_contacts);
  const documents = normalizeDocumentRows(opportunity?.documents, notice.documents, notice.procurement_files);
  const externalLinks = normalizeDocumentRows(opportunity?.external_links, notice.external_links);
  const unspscCodes = normalizeUnspscCodes(preferValue(opportunity?.unspsc_codes, notice.unspsc_codes));
  const agency = opportunity?.agency_full || opportunity?.agency || notice.agency_full || notice.agency || notice.organization || "";
  const description = preferValue(opportunity?.description, notice.description);

  return {
    ...notice,
    title: preferValue(opportunity?.title, notice.title),
    notice_type: preferValue(opportunity?.notice_type, notice.notice_type),
    // 编号以公告官方 reference 为准，商机侧 reference 仅兜底（与 bid-report 合并口径一致）
    reference: preferValue(notice.reference, opportunity?.reference),
    country: preferValue(opportunity?.country, notice.country),
    deadline: preferValue(opportunity?.deadline, notice.deadline),
    deadline_ts: preferValue(opportunity?.deadline_ts, notice.deadline_ts),
    // 截止时刻的 IANA 时区（国际标为 09:30 当地时间等非整日截止，无时区即无法正确倒计时）
    deadline_timezone: preferValue(opportunity?.deadline_timezone, notice.deadline_timezone) || "",
    estimated_value: preferValue(opportunity?.estimated_value, notice.estimated_value),
    description,
    description_cn: opportunity?.description_cn || "",
    description_other: opportunity?.description_other || "",
    intl_procurement: buildIntlProcurement(opportunity),
    bid_overview: opportunity?.bid_overview || "",
    supplier_conditions: opportunity?.supplier_conditions || "",
    eligibility: opportunity?.eligibility || "",
    technical_hurdles: opportunity?.technical_hurdles || "",
    ai_products: safeJson(opportunity?.ai_products),
    ai_analysis: safeJson(opportunity?.ai_analysis),
    product_code: opportunity?.product_code || "",
    beneficiary_countries: opportunity?.beneficiary_countries || "",
    agency,
    agency_full: opportunity?.agency_full || notice.agency_full,
    source_url: opportunity?.source_url || notice.url || "",
    contacts: mergedContacts,
    contact_methods: mergedContacts,
    documents,
    procurement_files: [],
    external_links: externalLinks,
    unspsc_codes: unspscCodes,
    core_info: {
      notice_id: notice.notice_id || "",
      opportunity_id: opportunity?.id || notice.converted_opp_id || null,
      detail_source: detailSource,
      reference: preferValue(notice.reference, opportunity?.reference) || "",
      notice_type: preferValue(opportunity?.notice_type, notice.notice_type) || "",
      agency,
      country: preferValue(opportunity?.country, notice.country) || "",
      deadline: preferValue(opportunity?.deadline, notice.deadline) || "",
      estimated_value: preferValue(opportunity?.estimated_value, notice.estimated_value) || "",
      registration_level: preferValue(opportunity?.registration_level, notice.registration_level) || "",
      unspsc_codes: unspscCodes,
    },
    opportunity_info: opportunity ? {
      id: opportunity.id,
      status: opportunity.status || "",
      is_qualified: Number(opportunity.is_qualified || 0),
      audit_status: opportunity.audit_status,
      review_status: opportunity.review_status || "",
      priority: opportunity.priority || "",
    } : null,
    core_locked: false,
    unlock_type: unlock?.unlock_type,
    unlocked_at: unlock?.unlocked_at,
    report_available: !!opportunity,
    report_url: opportunity ? `/api/notices/${notice.id}/report` : "",
  };
}
