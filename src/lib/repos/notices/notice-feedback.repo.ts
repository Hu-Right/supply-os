/**
 * 公告反馈数据访问层
 * Notice Feedback Repository
 *
 * @module server/repos/notices/notice-feedback.repo
 * @description 操作 crm_user_reco_feedback + crm_user_search_log 表。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

/** 推荐反馈批量插入项 */
export interface RecoFeedbackItem {
  noticeId: number;
  action: string;
  recoScore: number | null;
  position: number | null;
  variant: string | null;
  dwellMs: number | null;
}

export class NoticeFeedbackRepo {
  constructor(private pool: Pool) {}

  /** 推荐反馈批量插入（INSERT IGNORE，返回实际插入行数） */
  async insertRecoFeedback(userId: number, userKey: string, sessionId: string, items: RecoFeedbackItem[]): Promise<number> {
    const [insertResult] = await this.pool.query(
      `INSERT IGNORE INTO crm_user_reco_feedback
         (user_id, user_key, notice_id, action, reco_score, position, variant, session_id, dwell_ms)
       VALUES ${items.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}`,
      items.flatMap((item) => [
        userId, userKey, item.noticeId, item.action,
        item.recoScore, item.position, item.variant, sessionId, item.dwellMs,
      ]),
    );
    return Number((insertResult as RowDataPacket)?.affectedRows || 0);
  }

  /** 记录用户搜索日志（fire-and-forget，失败静默） */
  async logSearch(userKey: string, q: string | null, country: string | null, filters: string, resultCnt: number): Promise<void> {
    await this.pool.execute(
      "INSERT INTO crm_user_search_log (user_key, q, country, filters, result_cnt) VALUES (?, ?, ?, ?, ?)",
      [userKey, q, country, filters, resultCnt],
    );
  }
}
