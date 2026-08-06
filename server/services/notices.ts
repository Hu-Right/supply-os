/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { LRUCache } from "lru-cache";
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
    beneficiary_countries: opportunity?.beneficiary_countries || "",
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
    // 中文版订单拆解报告：合格 opportunity 存在即可生成（/:id/report 同口径）
    report_available: !!opportunity,
    report_url: opportunity ? `/api/notices/${notice.id}/report` : "",
  };
}

// ── 精选池判定（T-A1，本地差异 #14：A.2）──
// 合格机会口径单一事实源：is_qualified / won / 审核通过 三条任一。
// findQualifiedOpportunityForNotice 与精选 EXISTS 共用本函数，口径永不分叉
// 注意：status 列为 tinyint(1=won)，不可用字符串 'won' 比较（UPDATE 严格模式会报截断错误）
const qualifiedOppWhere = (alias = "") => {
  const p = alias ? `${alias}.` : "";
  return `(${p}is_qualified = 1 OR ${p}status = 1 OR ${p}audit_status = 1)`;
};

// ── [精选功能重新启用 2026-07-31] ──
// FEATURED_NOTICE_EXISTS 判定常量恢复启用（原 2026-07-29 临时注释停用）。
// 同批恢复的消费点：/api/notices 的 featured=1 过滤与 is_featured 页级标注、
// /api/notices/stats 的 featured 指标；前端开关/徽标/参数同步恢复。
// 注意：qualifiedOppWhere 被付费解锁详情（findQualifiedOpportunityForNotice）共用。
// 精选公告判定：两路精确子查询（converted_opp_id / source_notice_id）。
// [2026-08-01] 移除 reference 路径：全球招标编号体系不统一，同一 reference 可被多个
// 无关项目复用（如菲律宾 DA/DPWH 独立编号撞号），reference 路径无法校验标题相似度，
// 导致未精细化处理的公告被错误标为精选、详情页无拆解报告。仅保留精确关联路径，
// 确保精选徽标与报告可用性完全一致。
// 用非相关 IN 子查询（MySQL 物化一次 + 逐行 hash 查找）而非相关 EXISTS：
// 生产库实测 OR 连接两路相关 EXISTS 会阻止半连接转换、5.5 万行基线上超时，
// IN 物化且语义等价。
// 依赖外层查询别名 n = crm_bid_notices；可投标期限由列表既有 is_expired/deadline_ts 条件保障
export const FEATURED_NOTICE_EXISTS = `(
  n.converted_opp_id IN (SELECT o1.id FROM crm_bid_opportunities o1 WHERE ${qualifiedOppWhere("o1")})
  OR n.notice_id IN (SELECT o2.source_notice_id FROM crm_bid_opportunities o2
    WHERE ${qualifiedOppWhere("o2")} AND o2.source_notice_id IS NOT NULL AND o2.source_notice_id <> '')
)`;

// ── 标题相似度校验（reference 撞号防御）──
// 全球招标编号体系不统一，同一 reference 可能被多个不相关项目复用（如菲律宾农业部/公共工程部
// 各自独立编号恰好相同）。reference 路径匹配到机会后，必须比对标题关键词重合度，
// 相似度低于阈值则视为撞号污染，跳过该匹配避免详情页内容错位。
// Jaccard 相似度：词集合交集 / 并集，阈值 0.3 经验值（同项目标题通常 ≥0.6，不相关项目通常 <0.1）
const STOP_WORDS = new Set([
  "the", "a", "an", "of", "for", "in", "on", "at", "to", "and", "or", "with", "under",
]);
function tokenizeTitle(title: string): Set<string> {
  return new Set(
    String(title || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s\u00C0-\u024F\u4E00-\u9FFF]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
  );
}
function titleSimilarity(a: string, b: string): number {
  const tokensA = tokenizeTitle(a);
  const tokensB = tokenizeTitle(b);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const w of tokensA) if (tokensB.has(w)) intersection++;
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ── 合格机会查询进程内缓存 ──
// 详情端点与翻译端点对同一公告反复调用 findQualifiedOpportunityForNotice（每次 1-3 次顺序 DB
// 查询）。合格机会结果短期内不变，10 分钟 TTL 缓存消除重复查询；未命中（null）同样缓存，
// 避免无合格机会的公告反复走三路回退查询。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const oppCache = new LRUCache<string, any>({
  max: 500,
  ttl: 10 * 60 * 1000,
});

export async function findQualifiedOpportunityForNotice(dbPool: any, notice: Record<string, any>) {
  // 无 id 的载荷（如测试夹具/最小占位对象）无法稳定标识公告：跳过缓存直查
  const cacheKey = notice?.id != null
    ? `${notice.id}:${notice.converted_opp_id || 0}:${notice.notice_id || ""}`
    : "";
  if (cacheKey) {
    const cached = oppCache.get(cacheKey);
    if (cached !== undefined) return cached;
  }
  const result = await queryQualifiedOpportunity(dbPool, notice);
  if (cacheKey) oppCache.set(cacheKey, result);
  return result;
}

async function queryQualifiedOpportunity(dbPool: any, notice: any) {
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
    if ((rows as RowDataPacket[])[0]) return (rows as RowDataPacket[])[0];
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
    if ((rows as RowDataPacket[])[0]) return (rows as RowDataPacket[])[0];
  }

  if (notice.reference) {
    // [reference 撞号防御 2026-07-31] 全球招标编号体系不统一，同一 reference 可能对应多个不相关项目。
    // 取消 LIMIT 1，遍历所有候选机会，用标题相似度过滤撞号污染。
    // 相似度低于阈值（Jaccard < 0.3）则跳过，避免详情页被不相关机会数据覆盖。
    const [rows] = await dbPool.query(
      `SELECT ${fields}
       FROM crm_bid_opportunities
       WHERE reference = ? AND ${qualifiedWhere}
       ORDER BY is_qualified DESC, id DESC`,
      [String(notice.reference)]
    );
    for (const opp of rows as RowDataPacket[]) {
      if (titleSimilarity(notice.title, opp.title) >= 0.3) return opp;
    }
  }

  return null;
}

// ── P6 性能优化：is_featured 预计算列刷新 ──
// 用 FEATURED_NOTICE_EXISTS 实时计算结果同步到 crm_bid_notices.is_featured 列
// 启动时执行一次初始回填，之后每 30 分钟增量刷新
// 回滚：删除 refreshFeaturedColumn 函数，移除 bootstrap.ts 中的调用
export async function refreshFeaturedColumn(dbPool: Pool): Promise<{ marked: number; unmarked: number; changedIds: number[] }> {
  // 步骤 1：查询即将被标记为 featured 的 ID（当前 is_featured=0 但符合条件）
  const [toMarkRows] = await dbPool.query(
    `SELECT n.id FROM crm_bid_notices n WHERE ${FEATURED_NOTICE_EXISTS} AND n.is_featured = 0`
  );
  const toMarkIds = (toMarkRows as any[]).map(r => r.id);

  // 步骤 2：查询即将被取消 featured 的 ID（当前 is_featured=1 但不再符合条件）
  const [toUnmarkRows] = await dbPool.query(
    `SELECT n.id FROM crm_bid_notices n WHERE n.is_featured = 1 AND NOT (${FEATURED_NOTICE_EXISTS})`
  );
  const toUnmarkIds = (toUnmarkRows as any[]).map(r => r.id);

  // 步骤 3：执行 UPDATE
  if (toMarkIds.length > 0) {
    const placeholders = toMarkIds.map(() => "?").join(",");
    await dbPool.query(
      `UPDATE crm_bid_notices SET is_featured = 1 WHERE id IN (${placeholders})`,
      toMarkIds
    );
  }
  if (toUnmarkIds.length > 0) {
    const placeholders = toUnmarkIds.map(() => "?").join(",");
    await dbPool.query(
      `UPDATE crm_bid_notices SET is_featured = 0 WHERE id IN (${placeholders})`,
      toUnmarkIds
    );
  }

  const marked = toMarkIds.length;
  const unmarked = toUnmarkIds.length;
  const changedIds = [...toMarkIds, ...toUnmarkIds];

  if (marked > 0 || unmarked > 0) {
    console.log(`[featured-refresh] marked=${marked} unmarked=${unmarked}`);
  }
  return { marked, unmarked, changedIds };
}

