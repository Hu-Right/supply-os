/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { safeJson, preferValue } from "../utils/json";
import { normalizeContactRows, extractContactsFromText, normalizeDocumentRows } from "../utils/normalize";
import { normalizeUnspscCodes } from "./unspsc";

export function normalizeNoticeDetailPayload(notice: any, unlock?: any, opportunity?: any) {
  const detailSource = opportunity ? "opportunity" : "notice";
  const contacts = normalizeContactRows(opportunity?.contacts, notice.contacts, notice.key_contacts);
  const mergedContacts = contacts.length > 0 ? contacts : extractContactsFromText(String(notice.description || ""));
  const documents = normalizeDocumentRows(opportunity?.documents, notice.documents, notice.procurement_files);
  const externalLinks = normalizeDocumentRows(opportunity?.external_links, notice.external_links);
  const unspscCodes = normalizeUnspscCodes(preferValue(opportunity?.unspsc_codes, notice.unspsc_codes));
  const agency = opportunity?.agency_full || opportunity?.agency || notice.agency_full || notice.agency || notice.organization || "";
  const description = preferValue(opportunity?.description, notice.description);

  return {
    ...notice,
    title: preferValue(opportunity?.title, notice.title),
    notice_type: preferValue(opportunity?.notice_type, notice.notice_type),
    reference: preferValue(opportunity?.reference, notice.reference),
    country: preferValue(opportunity?.country, notice.country),
    deadline: preferValue(opportunity?.deadline, notice.deadline),
    deadline_ts: preferValue(opportunity?.deadline_ts, notice.deadline_ts),
    estimated_value: preferValue(opportunity?.estimated_value, notice.estimated_value),
    description,
    description_cn: opportunity?.description_cn || "",
    bid_overview: opportunity?.bid_overview || "",
    supplier_conditions: opportunity?.supplier_conditions || "",
    eligibility: opportunity?.eligibility || "",
    technical_hurdles: opportunity?.technical_hurdles || "",
    ai_products: safeJson(opportunity?.ai_products),
    ai_analysis: safeJson(opportunity?.ai_analysis),
    product_code: opportunity?.product_code || "",
    agency,
    agency_full: opportunity?.agency_full || notice.agency_full,
    source_url: opportunity?.source_url || notice.url || "",
    contacts: mergedContacts,
    contact_methods: mergedContacts,
    // 文件清单单一事实源：notice.documents/procurement_files 与 opportunity.documents 合并去重后
    // 统一走 documents；procurement_files 显式置空，防 ...notice 把 DB 原始 JSON 串透传给前端，
    // 也避免前端把同一份清单渲染两遍（原 tender_documents 别名无消费方，一并移除）
    documents,
    procurement_files: [],
    external_links: externalLinks,
    unspsc_codes: unspscCodes,
    core_info: {
      notice_id: notice.notice_id || "",
      opportunity_id: opportunity?.id || notice.converted_opp_id || null,
      detail_source: detailSource,
      reference: preferValue(opportunity?.reference, notice.reference) || "",
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
  };
}

// ── 精选池判定（T-A1，本地差异 #14：A.2）──
// 合格机会口径单一事实源：is_qualified / won / 审核通过 三条任一。
// findQualifiedOpportunityForNotice 与精选 EXISTS 共用本函数，口径永不分叉
const qualifiedOppWhere = (alias = "") => {
  const p = alias ? `${alias}.` : "";
  return `(${p}is_qualified = 1 OR ${p}status = 'won' OR ${p}audit_status = 1)`;
};

// ── [精选功能临时禁用 2026-07-29] ──
// FEATURED_NOTICE_EXISTS 判定常量整体注释停用（非删除，保留以便将来重新启用）。
// 同批注释的消费点：featuredIdsCache/getFeaturedIdSet、/api/notices 的 featured=1 过滤与
// is_featured 标注、/api/notices/stats 的 featured 指标；前端开关/徽标/参数同步注释。
// 注意：qualifiedOppWhere 被付费解锁详情（findQualifiedOpportunityForNotice）共用，保持启用。
// 精选公告判定：三路独立子查询（converted_opp_id / source_notice_id / reference）。
// 用非相关 IN 子查询（MySQL 物化一次 + 逐行 hash 查找）而非相关 EXISTS：
// 生产库实测 OR 连接三路相关 EXISTS 会阻止半连接转换、5.5 万行基线上超时，
// IN 物化 1.9s 且语义等价（scripts/verify-featured-exists.mjs 3/3 PASS）。
// 依赖外层查询别名 n = crm_bid_notices
// const FEATURED_NOTICE_EXISTS = `(
//   n.converted_opp_id IN (SELECT o1.id FROM crm_bid_opportunities o1 WHERE ${qualifiedOppWhere("o1")})
//   OR n.notice_id IN (SELECT o2.source_notice_id FROM crm_bid_opportunities o2
//     WHERE ${qualifiedOppWhere("o2")} AND o2.source_notice_id IS NOT NULL AND o2.source_notice_id <> '')
//   OR n.reference IN (SELECT o3.reference FROM crm_bid_opportunities o3
//     WHERE ${qualifiedOppWhere("o3")} AND o3.reference IS NOT NULL AND o3.reference <> '')
// )`;

export async function findQualifiedOpportunityForNotice(dbPool: any, notice: any) {
  const fields = `
    id, source_notice_id, source_url, title, reference, notice_type, registration_level,
    agency, agency_full, country, beneficiary_countries, published_date, deadline, deadline_ts,
    estimated_value, description, description_cn, bid_overview, supplier_conditions,
    eligibility, technical_hurdles, industry, unspsc_codes, thresholds, difficulty,
    contacts, documents, external_links, ai_products, ai_analysis, status, priority,
    audit_status, review_status, is_qualified, product_code
  `;
  const qualifiedWhere = qualifiedOppWhere();

  if (Number(notice.converted_opp_id || 0) > 0) {
    const [rows] = await dbPool.query(
      `SELECT ${fields}
       FROM crm_bid_opportunities
       WHERE id = ? AND ${qualifiedWhere}
       LIMIT 1`,
      [Number(notice.converted_opp_id)]
    );
    if ((rows as any[])[0]) return (rows as any[])[0];
  }

  if (notice.notice_id) {
    const [rows] = await dbPool.query(
      `SELECT ${fields}
       FROM crm_bid_opportunities
       WHERE source_notice_id = ? AND ${qualifiedWhere}
       ORDER BY is_qualified DESC, id DESC
       LIMIT 1`,
      [String(notice.notice_id)]
    );
    if ((rows as any[])[0]) return (rows as any[])[0];
  }

  if (notice.reference) {
    const [rows] = await dbPool.query(
      `SELECT ${fields}
       FROM crm_bid_opportunities
       WHERE reference = ? AND ${qualifiedWhere}
       ORDER BY is_qualified DESC, id DESC
       LIMIT 1`,
      [String(notice.reference)]
    );
    if ((rows as any[])[0]) return (rows as any[])[0];
  }

  return null;
}

