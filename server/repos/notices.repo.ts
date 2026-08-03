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

  // ─── 详情/翻译方法（Task 3 追加） ───────────────────────────────────────────

  /** 用户对公告的解锁记录（详情解锁校验） */
  async findUnlock(
    userKey: string,
    noticeId: number,
  ): Promise<{ id: number; unlock_type: string; unlocked_at: Date } | null> {
    const [rows] = await this.pool.query(
      "SELECT id, unlock_type, unlocked_at FROM crm_opportunity_unlocks WHERE user_key = ? AND notice_id = ? LIMIT 1",
      [userKey, noticeId],
    );
    return (rows as any[])[0] ?? null;
  }

  /** 公告详情全字段 */
  async findDetail(noticeId: number): Promise<any | null> {
    const [rows] = await this.pool.query(
      `SELECT id, notice_id, reference, title, notice_type, agency, organization, country,
       deadline, deadline_ts, estimated_value, description, industry, url, contacts,
       documents, procurement_files, external_links, agency_full, published_date,
       difficulty, registration_level, key_contacts, unspsc_codes, converted_opp_id, is_converted
     FROM crm_bid_notices WHERE id = ? LIMIT 1`,
      [noticeId],
    );
    return (rows as any[])[0] ?? null;
  }

  /** 公告锁定态预览字段 */
  async findPreview(noticeId: number): Promise<any | null> {
    const [rows] = await this.pool.query(
      `SELECT id, notice_id, reference, title, agency, organization, agency_full, published_date,
         unspsc_codes, converted_opp_id
       FROM crm_bid_notices WHERE id = ? LIMIT 1`,
      [noticeId],
    );
    return (rows as any[])[0] ?? null;
  }

  /** 公告译文缓存（无缓存返回 null；description_tr 可能为 null） */
  async findTranslationCache(
    noticeId: number,
    lang: string,
  ): Promise<{ title_tr: string | null; description_tr: string | null } | null> {
    const [rows] = await this.pool.query(
      "SELECT title_tr, description_tr FROM crm_notice_translations WHERE notice_id = ? AND lang = ? LIMIT 1",
      [noticeId, lang],
    );
    return (rows as any[])[0] ?? null;
  }

  /** 翻译决策所需元信息（描述源与机会转换标记） */
  async findDescMeta(
    noticeId: number,
  ): Promise<{ notice_desc: string | null; converted_opp_id: number | null; notice_id: string | null; reference: string | null } | null> {
    const [rows] = await this.pool.query(
      `SELECT n.description AS notice_desc, n.converted_opp_id, n.notice_id, n.reference
       FROM crm_bid_notices n WHERE n.id = ? LIMIT 1`,
      [noticeId],
    );
    return (rows as any[])[0] ?? null;
  }

  /** 仅更新译文描述（机会表覆盖重翻 / 描述补翻） */
  async updateTranslationDescription(noticeId: number, lang: string, descriptionTr: string, model: string): Promise<void> {
    await this.pool.query(
      `UPDATE crm_notice_translations SET description_tr = ?, model = ? WHERE notice_id = ? AND lang = ?`,
      [descriptionTr, model, noticeId, lang],
    );
  }

  /** 翻译源字段（标题 + 描述 + 机会转换标记） */
  async findForTranslation(noticeId: number): Promise<any | null> {
    const [rows] = await this.pool.query(
      "SELECT id, notice_id, reference, title, description, converted_opp_id FROM crm_bid_notices WHERE id = ? LIMIT 1",
      [noticeId],
    );
    return (rows as any[])[0] ?? null;
  }

  /** 公告译文缓存 upsert（descriptionTr 传 null 时仅缓存标题） */
  async upsertTranslation(
    noticeId: number,
    lang: string,
    titleTr: string,
    descriptionTr: string | null,
    model: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO crm_notice_translations (notice_id, lang, title_tr, description_tr, model)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE title_tr = VALUES(title_tr), description_tr = VALUES(description_tr), model = VALUES(model)`,
      [noticeId, lang, titleTr, descriptionTr, model],
    );
  }

  /** 指定语言译文是否已存在（英文中枢兜底前置检查） */
  async hasTranslation(noticeId: number, lang: string): Promise<boolean> {
    const [rows] = await this.pool.query(
      "SELECT id FROM crm_notice_translations WHERE notice_id = ? AND lang = ? LIMIT 1",
      [noticeId, lang],
    );
    return (rows as any[]).length > 0;
  }

  /** 英文中枢兜底 upsert（已有字段不被 null 覆盖） */
  async upsertEnPivotTranslation(
    noticeId: number,
    titleTr: string | null,
    descriptionTr: string | null,
    model: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO crm_notice_translations (notice_id, lang, title_tr, description_tr, model)
       VALUES (?, 'en', ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title_tr = COALESCE(VALUES(title_tr), title_tr),
         description_tr = COALESCE(VALUES(description_tr), description_tr)`,
      [noticeId, titleTr, descriptionTr, model],
    );
  }
}
