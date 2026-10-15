/**
 * 公采池统计
 * Notice pool statistics
 *
 * @module server/services/notice-search/stats
 * @description 首页规模条的六路 COUNT 统计（10 分钟内存缓存 + 请求级锁）。
 *
 *              2026-10-15 审计收刀：crm_notice_stats 预计算表管线（refreshNoticeStats/
 *              statsKeyFor/getStatsCount，warmup + 10 分钟定时器喂养、每轮 ~102 键逐键 upsert）
 *              在旧搜索管道退役后已无任何读取方——getNoticeStats 从不查统计表，直接 COUNT。
 *              整条管线与内存 count/featured/noticeType 缓存四件套一并删除；
 *              crm_notice_stats 表随 DDL 批次 DROP。
 */
import { RFQ_STATUS } from "@/shared/constants/rfq";
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { NoticeStatsResult } from "./types";
import { ACTIVE_NOTICE_WHERE_NO_ALIAS } from "../../utils/notice-expired";

// ── 统计缓存 + 请求级锁 ──
let noticeStatsCache: { data: NoticeStatsResult; expires: number } | null = null;
/** 请求级锁：防止并发请求同时触发多轮 6 查询，只允许一个请求计算，其余等待结果 */
let statsCalcPromise: Promise<NoticeStatsResult> | null = null;

/** 获取公采池统计数据 — 串行执行 + 请求级锁，避免并发重复计算压垮数据库 */
export function getNoticeStats(pool: Pool): Promise<NoticeStatsResult> {
  // 缓存命中直接返回
  if (noticeStatsCache && noticeStatsCache.expires > Date.now()) {
    return Promise.resolve(noticeStatsCache.data);
  }
  // 已有计算在进行中，复用其 Promise（请求级锁）
  if (statsCalcPromise) return statsCalcPromise;

  statsCalcPromise = (async () => {
    try {
      const [rawRows] = await pool.query("SELECT COUNT(*) AS total FROM crm_bid_notices n");
      const [activeRows] = await pool.query(`SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE ${ACTIVE_NOTICE_WHERE_NO_ALIAS}`);
      const [bridgedRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE ${ACTIVE_NOTICE_WHERE_NO_ALIAS}
         AND EXISTS (SELECT 1 FROM crm_notice_backbone_nodes b WHERE b.notice_id = n.id)`
      );
      const [featuredRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE ${ACTIVE_NOTICE_WHERE_NO_ALIAS} AND n.is_featured = 1`
      );
      // 模块02 规模条口径（谓词字面内联以通过静态扫描，与 ACTIVE_NOTICE_WHERE_NO_ALIAS
      // 逐字一致，口径变更须与 utils/notice-expired 两处同步）：
      // 未来 30 天截止（把握近期机会）
      const [deadline30Rows] = await pool.query(
        `SELECT COUNT(*) AS total FROM crm_bid_notices n
         WHERE (n.deadline_sec = 0 OR n.deadline_sec >= UNIX_TIMESTAMP(NOW()))
           AND n.deadline_sec > UNIX_TIMESTAMP(NOW())
           AND n.deadline_sec <= UNIX_TIMESTAMP(NOW()) + 30 * 86400
           AND (n.entry_source <> 'platform' OR IFNULL(n.rfq_status, '') = ${JSON.stringify(RFQ_STATUS.PUBLISHED)})`
      );
      // 含原始文件（宽表 documents_count>0，可下载附件）
      const [docsRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM crm_notice_search ns
         WHERE (ns.deadline_sec = 0 OR ns.deadline_sec >= UNIX_TIMESTAMP(NOW()))
           AND ns.documents_count > 0`
      );
      const active = Number((activeRows as RowDataPacket[])[0]?.total || 0);
      const bridged = Number((bridgedRows as RowDataPacket[])[0]?.total || 0);
      const data: NoticeStatsResult = {
        raw: Number((rawRows as RowDataPacket[])[0]?.total || 0), active, bridged,
        featured: Number((featuredRows as RowDataPacket[])[0]?.total || 0), bridge_gap: active - bridged,
        deadline_in_30d: Number((deadline30Rows as RowDataPacket[])[0]?.total || 0),
        with_original_docs: Number((docsRows as RowDataPacket[])[0]?.total || 0),
      };
      noticeStatsCache = { data, expires: Date.now() + 10 * 60 * 1000 };
      return data;
    } finally {
      statsCalcPromise = null;
    }
  })();

  return statsCalcPromise;
}

/** 清除统计缓存（测试辅助） */
export function clearStatsCache(): void {
  noticeStatsCache = null;
  statsCalcPromise = null;
}
