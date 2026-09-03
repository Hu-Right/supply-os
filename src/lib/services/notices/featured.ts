/**
 * 精选公告逻辑
 * Featured Notice Logic
 *
 * @module server/services/notices/featured
 * @description 精选公告池判定、合格机会查询、标题相似度校验、is_featured 预计算列刷新。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { LRUCache } from "lru-cache";

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
/** 公告标识字段（调用方传入的行子集，字段可能缺失；索引签名兼容 RowDataPacket 调用方） */
interface NoticeIdentity {
  id?: number | string;
  converted_opp_id?: number | string | null;
  notice_id?: string | number;
  reference?: string;
  title?: string;
  [key: string]: unknown;
}

const oppCache = new LRUCache<string, { row: RowDataPacket | null }>({
  max: 500,
  ttl: 10 * 60 * 1000,
});

export async function findQualifiedOpportunityForNotice(dbPool: Pool, notice: NoticeIdentity) {
  // 无 id 的载荷（如测试夹具/最小占位对象）无法稳定标识公告：跳过缓存直查
  const cacheKey = notice?.id != null
    ? `${notice.id}:${notice.converted_opp_id || 0}:${notice.notice_id || ""}`
    : "";
  if (cacheKey) {
    const cached = oppCache.get(cacheKey);
    if (cached !== undefined) return cached.row;
  }
  const result = await queryQualifiedOpportunity(dbPool, notice);
  if (cacheKey) oppCache.set(cacheKey, { row: result });
  return result;
}

async function queryQualifiedOpportunity(dbPool: Pool, notice: NoticeIdentity) {
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
      if (titleSimilarity(notice.title ?? "", opp.title) >= 0.3) return opp;
    }
  }

  return null;
}

// ── P6 性能优化：is_featured 预计算列刷新 ──
// 用 FEATURED_NOTICE_EXISTS 实时计算结果同步到 crm_bid_notices.is_featured 列
// 启动时执行一次初始回填，之后每 30 分钟增量刷新
// 回滚：删除 refreshFeaturedColumn 函数，移除 bootstrap.ts 中的调用

// ── 精选状态变更联动回调（修复 G3）──
// 当 refreshFeaturedColumn 更新了 is_featured 后，需通知同步模块将变更
// 级联到宽表 → Meilisearch 索引。使用回调注册机制避免循环依赖。
let _onFeaturedChanged: ((ids: number[]) => void) | null = null;

/** 注册精选状态变更的同步回调（由 bootstrap 在启动时调用） */
export function registerFeaturedSyncCallback(cb: (ids: number[]) => void): void {
  _onFeaturedChanged = cb;
}

export async function refreshFeaturedColumn(dbPool: Pool): Promise<{ marked: number; unmarked: number; changedIds: number[] }> {
  // 步骤 1：查询即将被标记为 featured 的 ID（当前 is_featured=0 但符合条件）
  const [toMarkRows] = await dbPool.query(
    `SELECT n.id FROM crm_bid_notices n WHERE ${FEATURED_NOTICE_EXISTS} AND n.is_featured = 0`
  );
  const toMarkIds = (toMarkRows as RowDataPacket[]).map(r => Number(r.id));

  // 步骤 2：查询即将被取消 featured 的 ID（当前 is_featured=1 但不再符合条件）
  const [toUnmarkRows] = await dbPool.query(
    `SELECT n.id FROM crm_bid_notices n WHERE n.is_featured = 1 AND NOT (${FEATURED_NOTICE_EXISTS})`
  );
  const toUnmarkIds = (toUnmarkRows as RowDataPacket[]).map(r => Number(r.id));

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
    // 修复 G3：精选状态变更后触发级联同步（宽表 → Meilisearch），
    // 确保 is_featured 字段在搜索索引中及时更新
    if (changedIds.length > 0 && _onFeaturedChanged) {
      _onFeaturedChanged(changedIds);
    }
  }
  return { marked, unmarked, changedIds };
}
