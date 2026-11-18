/**
 * 公告反馈数据访问层
 * Notice Feedback Repository
 *
 * @module server/repos/notices/notice-feedback.repo
 * @description 操作 user_reco_feedback + user_search_log 表。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

/** 推荐反馈批量插入项 */
export interface RecoFeedbackItem {
  noticeId: number;
  action: string;
  variant: string | null;
  dwellMs: number | null;
}

/** 一次检索日志（匿名/登录统一结构；首页真实热门搜索的聚合来源） */
export interface SearchLogEntry {
  /** 登录用户 id；匿名检索为 null（按 visitorHash 去重） */
  userId: number | null;
  /** 原始检索词：登录用户保留原文；匿名不落原文（隐私最小化），只落 qNorm */
  q: string | null;
  /** 归一化检索词（热门聚合键） */
  qNorm: string | null;
  country: string | null;
  filters: string;
  resultCnt: number;
  /** 匿名访客哈希（sha256(日盐|IP|UA)），不存原始 IP */
  visitorHash: string | null;
  locale: string | null;
  source: string | null;
  /** 疑似爬虫/脚本：计入日志但不进热门聚合 */
  isBot: boolean;
}

export class NoticeFeedbackRepo {
  constructor(private pool: Pool) {}

  /** 推荐反馈批量插入（INSERT IGNORE，返回实际插入行数） */
  async insertRecoFeedback(userId: number, sessionId: string, items: RecoFeedbackItem[]): Promise<number> {
    const [insertResult] = await this.pool.query(
      `INSERT IGNORE INTO user_reco_feedback
         (user_id, notice_id, action, variant, session_id, dwell_ms)
       VALUES ${items.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")}`,
      items.flatMap((item) => [
        userId, item.noticeId, item.action, item.variant, sessionId, item.dwellMs,
      ]),
    );
    return Number((insertResult as RowDataPacket)?.affectedRows || 0);
  }

  /** 记录检索日志（fire-and-forget，失败静默）。匿名检索也记录，但只落访客哈希与归一化词 */
  async logSearch(entry: SearchLogEntry): Promise<void> {
    await this.pool.execute(
      `INSERT INTO user_search_log
         (user_id, q, q_norm, country, filters, result_cnt, visitor_hash, locale, source, is_bot)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.userId, entry.q, entry.qNorm, entry.country, entry.filters, entry.resultCnt,
        entry.visitorHash, entry.locale, entry.source, entry.isBot ? 1 : 0,
      ],
    );
  }
}
