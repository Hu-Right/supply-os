/**
 * 首页三栏「热门商机 / 最新 RFQ」的服务表取数（2026-11-18 起不再经 Meili 检索）
 *
 * @module server/services/notice-public/home-columns
 * @description 为什么改：
 *   1) 这两栏本质是「服务表机会池里挑 20 条」，走 unified-search 会先打 Meili 再回 MySQL
 *      取详情，链路多一跳、还受索引健康/降级影响；
 *   2) 更直接的问题：unified-search 路由会把带条件的检索写进 user_search_log（featured/
 *      notice_type 都算 hasSearch），首页每曝光一次就产生两条“假检索”，污染真实热门搜索统计；
 *      本服务不写检索日志；
 *   3) 口径与数字墙统一为服务表（notice_public）。
 *
 * 排序口径（**与旧 Meili 的 "newest" 不同，需知晓**）：
 *   旧口径 = has_deadline desc, id desc（有截止日优先）；新口径 = **notice_pk 倒序（最新入库优先）**。
 *   notice_pk 来自主表 id（爬虫侧按时间递增 / 平台行自增），倒序即“最新进入机会池”，
 *   与栏目名“最新”一致；无截止的公告不再被强制排到最后。
 *
 * 卡片字段与搜索列表完全同一条出口链（fetchDetailsByIds → formatItems → toNoticeListView），
 * 保证首页卡片与 /procurement 列表的字段/裁剪/命名契约零漂移。
 */
import "server-only";
import type { Pool } from "mysql2/promise";
import { fetchDetailsByIds } from "../search-orchestrator/detail-fetch";
import { formatItems } from "../search-orchestrator/format";

/** 首页三栏的两种公告列 */
export type HomeNoticeColumnKind = "opportunity" | "rfq";

/** 服务表有效机会谓词（与数字墙 active 同口径） */
const PUBLIC_ACTIVE = "(deadline_ts IS NULL OR deadline_ts = 0 OR deadline_ts >= UNIX_TIMESTAMP(NOW()))";

/** 栏目 → 服务表过滤条件（列名均为服务表预计算列，读侧零归一化） */
const COLUMN_WHERE: Record<HomeNoticeColumnKind, string> = {
  // 热门商机 = 服务表「商机集合」（is_featured 或关联合格/在架/过审商机；与 /api/notices/stats 的 featured 同源）
  opportunity: "is_opportunity = 1",
  // 最新 RFQ = 采购类型归一码（构建时 normalizeNoticeType 写入）
  rfq: "notice_type_code = 'RFQ'",
};

/**
 * 读取首页某一栏的公告原始行（默认 20 条）。
 * 返回 formatItems 输出（snake_case 行 + core_locked），由调用方出口统一走
 * toNoticeListView 转视图（红线②：mapper 只在端点/快照出口调用）。
 * @param kind opportunity=热门商机 / rfq=最新 RFQ 询价
 * @param limit 条数（1..20）
 */
export async function getHomeNoticeColumn(
  pool: Pool,
  kind: HomeNoticeColumnKind,
  limit = 20,
): Promise<Array<Record<string, unknown>>> {
  const safeLimit = Math.min(Math.max(Math.floor(limit) || 20, 1), 20);
  const where = COLUMN_WHERE[kind];
  const [rows] = await pool.query(
    `SELECT notice_pk FROM notice_public
      WHERE ${where} AND ${PUBLIC_ACTIVE}
      ORDER BY notice_pk DESC
      LIMIT ?`,
    [safeLimit],
  );
  const ids = (rows as Array<{ notice_pk: number }>).map((r) => Number(r.notice_pk)).filter((n) => Number.isFinite(n));
  if (ids.length === 0) return [];
  const detailRows = await fetchDetailsByIds(pool, ids, "zh");
  return formatItems(detailRows);
}
