/**
 * AI 匹配粗筛 UNSPSC 数据加载器
 * @module lib/services/ai-match/unspsc-levels
 * @description 两条只读查询为 pre-filter 准备层级匹配数据：
 *              公告侧 = crm_bid_notice_unspsc_codes 桥接行（经 crm_bid_notices.notice_id
 *              外部编号关联，桥接表主键不是平台自增 id）；
 *              供应商侧 = crm_supplier_unspsc_interests 兴趣码 JOIN 字典自身 + 4 级父链，
 *              展开为各级祖先 id（数据生产在上游 intelligence-daily 管线，本仓库只读）。
 *              fail-safe：任一查询失败/无数据 → 空映射，粗筛整体退化为纯词项重叠，
 *              绝不打断 AI 匹配主流程（排序优化信号缺失不致命）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { PreFilterUnspscData } from "./pre-filter";

const EMPTY: PreFilterUnspscData = { noticeLevels: new Map(), supplierLevels: new Map() };

type LevelSets = Map<number, Set<string>>;

/** 把一行桥接列（level1_id..level5_id，VARCHAR 可空串）并入层级集合 */
function mergeNoticeRow(row: RowDataPacket, into: LevelSets): void {
  for (let level = 1; level <= 5; level += 1) {
    const raw = String(row[`level${level}_id`] ?? "").trim();
    if (!raw) continue;
    if (!into.has(level)) into.set(level, new Set());
    into.get(level)!.add(raw);
  }
}

/** 把一条兴趣码字典链行（n0/l0 自身 + n1..n4 父级，LEFT JOIN 可为 null）并入该供应商集合 */
function mergeSupplierChainRow(row: RowDataPacket, into: Map<number, LevelSets>): void {
  const supplierId = Number(row.supplier_id);
  if (!Number.isFinite(supplierId) || supplierId <= 0) return;
  for (let i = 0; i <= 4; i += 1) {
    const id = row[`n${i}`];
    const level = Number(row[`l${i}`] ?? 0);
    if (id == null || level < 1 || level > 5) continue;
    if (!into.has(supplierId)) into.set(supplierId, new Map());
    const levels = into.get(supplierId)!;
    if (!levels.has(level)) levels.set(level, new Set());
    levels.get(level)!.add(String(id));
  }
}

/**
 * 加载粗筛所需 UNSPSC 层级数据。
 * @param supplierIds 本轮参与粗筛的候选平台供应商 id（self 不参与粗筛，无需传入）
 */
export async function loadUnspscMatchData(
  pool: Pool,
  noticeId: number,
  supplierIds: number[],
): Promise<PreFilterUnspscData> {
  const validIds = supplierIds.filter((id) => Number.isFinite(id) && id > 0);
  if (validIds.length === 0) return EMPTY;
  try {
    // 公告侧：桥接表按 notice_id 外部编号存储，须从平台自增 id 中转一次
    const [noticeRows] = await pool.query(
      `SELECT b.level1_id, b.level2_id, b.level3_id, b.level4_id, b.level5_id
       FROM crm_bid_notice_unspsc_codes b
       JOIN crm_bid_notices n ON n.notice_id = b.notice_id
       WHERE n.id = ?`,
      [noticeId],
    );
    const noticeLevels: LevelSets = new Map();
    for (const row of noticeRows as RowDataPacket[]) mergeNoticeRow(row, noticeLevels);
    // 公告无码：所有供应商必然零档，无需再查供应商侧
    if (noticeLevels.size === 0) return { noticeLevels, supplierLevels: new Map() };

    const placeholders = validIds.map(() => "?").join(",");
    const [supplierRows] = await pool.query(
      `SELECT u.supplier_id,
              c0.id AS n0, c0.level AS l0,
              c1.id AS n1, c1.level AS l1,
              c2.id AS n2, c2.level AS l2,
              c3.id AS n3, c3.level AS l3,
              c4.id AS n4, c4.level AS l4
       FROM crm_supplier_unspsc_interests u
       JOIN crm_unspsc_codes c0 ON c0.id = u.code_id
       LEFT JOIN crm_unspsc_codes c1 ON c1.id = c0.parent_id
       LEFT JOIN crm_unspsc_codes c2 ON c2.id = c1.parent_id
       LEFT JOIN crm_unspsc_codes c3 ON c3.id = c2.parent_id
       LEFT JOIN crm_unspsc_codes c4 ON c4.id = c3.parent_id
       WHERE u.supplier_id IN (${placeholders})`,
      validIds,
    );
    const supplierLevels = new Map<number, LevelSets>();
    for (const row of supplierRows as RowDataPacket[]) mergeSupplierChainRow(row, supplierLevels);
    return { noticeLevels, supplierLevels };
  } catch (err) {
    console.warn("[ai-match] UNSPSC 粗筛数据加载失败，退化为纯词项粗筛:", err instanceof Error ? err.message : err);
    return EMPTY;
  }
}
