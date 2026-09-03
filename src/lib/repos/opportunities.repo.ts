/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 商机数据访问层
 * Opportunities Repository
 *
 * @module repos/opportunities.repo
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { UnspscCodeRow } from "../services/unspsc";
import { ACTIVE_OPP_WHERE } from "../utils/notice-expired";

/** 商机列表行（未过期，最多 80 条） */
export interface OpportunityListItemRow {
  id: number;
  title: string | null;
  reference: string | null;
  notice_type: string | null;
  agency: string | null;
  country: string | null;
  deadline: string | null;
  deadline_ts: number | null;
  estimated_value: string | null;
  budget: string | null;
  description: string | null;
  industry: string | null;
  unspsc_codes: string | null;
  source_url: string | null;
  unlock_count: number | null;
  view_count: number | null;
}

/** 商机解锁流水行 */
export interface OpportunityUnlockRow {
  opportunity_id: number;
  unlock_type: string;
  unlocked_at: Date;
}

export class OpportunitiesRepo {
  constructor(private pool: Pool) {}

  /** 按 id 查 UNSPSC 码（列表级别过滤用） */
  async findUnspscCodeById(id: number): Promise<UnspscCodeRow | null> {
    const [rows] = await this.pool.query(
      "SELECT id, level FROM crm_unspsc_codes WHERE id = ? LIMIT 1",
      [id],
    );
    return (rows as UnspscCodeRow[])[0] ?? null;
  }

  /** 按 code 文本查 UNSPSC 码（兴趣码落库用） */
  async findUnspscCodeByCode(code: string): Promise<UnspscCodeRow | null> {
    const [rows] = await this.pool.query(
      "SELECT id, level FROM crm_unspsc_codes WHERE code = ? LIMIT 1",
      [code],
    );
    return (rows as UnspscCodeRow[])[0] ?? null;
  }

  /** 未过期商机列表；codeId > 0 时按对应 UNSPSC 级别过滤 */
  async listOpportunities(codeId: number): Promise<OpportunityListItemRow[]> {
    const where: string[] = [ACTIVE_OPP_WHERE];
    const params: any[] = [];
    let join = "";
    if (codeId) {
      const code = await this.findUnspscCodeById(codeId);
      // P3-12 安全修复：level 白名单校验（1-5）后才参与列名拼接，阻断非法级别值
      if (code && Number.isInteger(code.level) && code.level >= 1 && code.level <= 5) {
        join = "INNER JOIN crm_bid_opportunity_unspsc_codes boc ON boc.opportunity_id = o.id";
        where.push(`boc.level${code.level}_id = ?`);
        params.push(code.id);
      }
    }
    const [rows] = await this.pool.query(
      `SELECT DISTINCT
         o.id, o.title, o.reference, o.notice_type, o.agency, o.country,
         o.deadline, o.deadline_ts, o.estimated_value, o.budget, o.description,
         o.industry, o.unspsc_codes, o.source_url, o.unlock_count, o.view_count
       FROM crm_bid_opportunities o
       ${join}
       WHERE ${where.join(" AND ")}
       ORDER BY (o.deadline_sec = 0), o.deadline_sec ASC, o.id DESC
       LIMIT 80`,
      params,
    );
    return rows as OpportunityListItemRow[];
  }

  /** 用户商机解锁流水（按解锁时间倒序） */
  async listUnlocks(userId: number): Promise<OpportunityUnlockRow[]> {
    const [rows] = await this.pool.query(
      "SELECT opportunity_id, unlock_type, unlocked_at FROM crm_opportunity_unlocks WHERE user_id = ? ORDER BY unlocked_at DESC",
      [userId],
    );
    return rows as OpportunityUnlockRow[];
  }

  /** 商机译文缓存（无缓存返回 null） */
  async findTranslationCache(
    opportunityId: number,
    lang: string,
  ): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      "SELECT title_tr, description_tr FROM crm_opportunity_translations WHERE opportunity_id = ? AND lang = ? LIMIT 1",
      [opportunityId, lang],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 商机标题与描述（翻译源） */
  async findTextById(
    opportunityId: number,
  ): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      "SELECT title, description FROM crm_bid_opportunities WHERE id = ? LIMIT 1",
      [opportunityId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 商机译文缓存 upsert */
  async upsertTranslation(
    opportunityId: number,
    lang: string,
    titleTr: string,
    descriptionTr: string,
    model: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO crm_opportunity_translations (opportunity_id, lang, title_tr, description_tr, model)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE title_tr = VALUES(title_tr), description_tr = VALUES(description_tr), model = VALUES(model)`,
      [opportunityId, lang, titleTr, descriptionTr, model],
    );
  }

  /** 记录浏览流水 */
  async insertView(params: { userId: number; opportunityId: number; ip: string }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_user_notice_views (user_id, opportunity_id, viewed_at, ip)
       VALUES (?, ?, NOW(), ?)`,
      [params.userId, params.opportunityId, params.ip],
    );
  }

  /** 浏览数 +1 */
  async incrementViewCount(opportunityId: number): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_bid_opportunities SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?",
      [opportunityId],
    );
  }

  /** 已有解锁记录（幂等判定，无记录返回 null） */
  async findExistingUnlock(
    userId: number,
    opportunityId: number,
  ): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      "SELECT id, unlock_type FROM crm_opportunity_unlocks WHERE user_id = ? AND opportunity_id = ? LIMIT 1",
      [userId, opportunityId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 按 id 查商机完整字段（报告生成用）
   *  P3-12 安全修复：显式列清单替代 SELECT *，与 mergeBidReportRow 消费字段对齐，
   *  避免表结构变更时意外泄露新增敏感列 */
  async findFullById(opportunityId: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      `SELECT id, reference, title, notice_type, registration_level, agency, agency_full,
              source_platform, industry, incoterms, published_date, deadline, deadline_timezone,
              estimated_value, description, description_cn, description_other, bid_overview,
              supplier_conditions, eligibility, technical_hurdles, training_link, remark,
              product_code, source_url, unspsc_codes, ai_products, ai_analysis,
              documents, external_links, contacts, update_time
       FROM crm_bid_opportunities WHERE id = ? LIMIT 1`,
      [opportunityId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 按 id 查商机（解锁时取 UNSPSC 快照） */
  async findById(opportunityId: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      "SELECT id, unspsc_codes FROM crm_bid_opportunities WHERE id = ? LIMIT 1",
      [opportunityId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 写入解锁流水 */
  async insertUnlock(params: {
    userId: number;
    opportunityId: number;
    unlockType: string;
    price: number;
    unspscSnapshot: string;
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_opportunity_unlocks
        (user_id, opportunity_id, unlock_type, price, unlocked_at, unspsc_codes_snapshot)
       VALUES (?, ?, ?, ?, NOW(), ?)`,
      [params.userId, params.opportunityId, params.unlockType, params.price, params.unspscSnapshot],
    );
  }

  /** 解锁数 +1 */
  async incrementUnlockCount(opportunityId: number): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_bid_opportunities SET unlock_count = COALESCE(unlock_count, 0) + 1 WHERE id = ?",
      [opportunityId],
    );
  }

  /** 兴趣码 upsert（解锁来源，重复时权重 +0.50） */
  async upsertInterestCode(params: {
    userId: number;
    codeId: number | null;
    code: string;
    level: number;
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_user_interest_codes (user_id, code_id, code, level, source, weight)
       VALUES (?, ?, ?, ?, 'unlock_order', 2.50)
       ON DUPLICATE KEY UPDATE weight = weight + 0.50, updated_at = NOW()`,
      [params.userId, params.codeId, params.code, params.level],
    );
  }
}
