/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 公告数据访问层（用户动作 + 详情/翻译）
 * Notices Repository
 *
 * @module repos/notices.repo
 */
import type { Pool } from "mysql2/promise";

/** 推荐反馈批量插入项 */
export interface RecoFeedbackItem {
  noticeId: number;
  action: string;
  recoScore: number | null;
  position: number | null;
  variant: string | null;
  dwellMs: number | null;
}

export class NoticesRepo {
  constructor(private pool: Pool) {}

  /** 用户公告解锁流水（仅公告，按解锁时间倒序） */
  async listNoticeUnlocks(userKey: string): Promise<any[]> {
    const [rows] = await this.pool.query(
      "SELECT notice_id, unlock_type, unlocked_at FROM crm_opportunity_unlocks WHERE user_key = ? AND notice_id IS NOT NULL ORDER BY unlocked_at DESC",
      [userKey],
    );
    return rows as any[];
  }

  /** 推荐反馈批量插入（INSERT IGNORE，返回实际插入行数） */
  async insertRecoFeedback(userKey: string, sessionId: string, items: RecoFeedbackItem[]): Promise<number> {
    const [insertResult] = await this.pool.query(
      `INSERT IGNORE INTO crm_user_reco_feedback
         (user_id, user_key, notice_id, action, reco_score, position, variant, session_id, dwell_ms)
       VALUES ${items.map(() => "((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}`,
      items.flatMap((item) => [
        userKey, userKey, item.noticeId, item.action,
        item.recoScore, item.position, item.variant, sessionId, item.dwellMs,
      ]),
    );
    return Number((insertResult as any)?.affectedRows || 0);
  }

  /** 批量取公告 UNSPSC 原始串（反馈联动兴趣码用） */
  async findUnspscSnapshots(noticeIds: number[]): Promise<{ id: number; unspsc_codes: string | null }[]> {
    const [rows] = await this.pool.query(
      `SELECT id, unspsc_codes FROM crm_bid_notices WHERE id IN (${noticeIds.map(() => "?").join(",")})`,
      noticeIds,
    );
    return rows as any[];
  }

  /** 记录公告浏览流水 */
  async insertView(params: { userKey: string; noticeId: number; ip: string }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_user_notice_views (user_id, user_key, notice_id, viewed_at, ip)
       VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, NOW(), ?)`,
      [params.userKey, params.userKey, params.noticeId, params.ip],
    );
  }

  /** 已有解锁记录（幂等判定，无记录返回 null） */
  async findExistingUnlock(userKey: string, noticeId: number): Promise<{ id: number } | null> {
    const [rows] = await this.pool.query(
      "SELECT id FROM crm_opportunity_unlocks WHERE user_key = ? AND notice_id = ? LIMIT 1",
      [userKey, noticeId],
    );
    return (rows as any[])[0] ?? null;
  }

  /** 按 id 查公告（解锁/意向时取 UNSPSC 快照） */
  async findById(noticeId: number): Promise<{ id: number; unspsc_codes: string | null } | null> {
    const [rows] = await this.pool.query(
      "SELECT id, unspsc_codes FROM crm_bid_notices WHERE id = ? LIMIT 1",
      [noticeId],
    );
    return (rows as any[])[0] ?? null;
  }

  /** 写入解锁流水 */
  async insertUnlock(params: {
    userKey: string;
    noticeId: number;
    unlockType: string;
    price: number;
    unspscSnapshot: string;
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_opportunity_unlocks
        (user_id, user_key, notice_id, unlock_type, price, unlocked_at, unspsc_codes_snapshot)
       VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, NOW(), ?)`,
      [params.userKey, params.userKey, params.noticeId, params.unlockType, params.price, params.unspscSnapshot],
    );
  }

  /** 消耗一份付费配额（配额不足时不更新） */
  async consumeEntitlement(entitlementId: number): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_user_entitlements SET quota_used = quota_used + 1, updated_at = NOW() WHERE id = ? AND quota_total > quota_used",
      [entitlementId],
    );
  }

  /** 公告意向 upsert（详情页来源） */
  async upsertInterest(params: {
    userKey: string;
    noticeId: number;
    interestType: string;
    note: string;
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_notice_interests (user_id, user_key, notice_id, interest_type, source, note)
       VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, 'detail_page', ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), note = VALUES(note), updated_at = NOW()`,
      [params.userKey, params.userKey, params.noticeId, params.interestType, params.note],
    );
  }
}
