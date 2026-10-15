/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 商机数据访问层
 * Opportunities Repository
 *
 * @module repos/opportunities.repo
 * @description 旧品类码退役 R5'（2026-10-14）：主表那个 JSON 快照列运行期不再 SELECT；
 *              列形制属历史采集快照，与新事实源 crm_notice_attribution_nodes 不相关。
 *              物理 DROP 属下一批次（§9 桥表 / 主表 JSON 列同批）。消费方（merge/route）一律写死 []。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
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
  /** 排序键（STORED 生成列）；DISTINCT 查询要求 ORDER BY 列必须出现在 SELECT 列表 */
  deadline_sec: number | null;
  estimated_value: string | null;
  description: string | null;
  industry: string | null;
  source_url: string | null;
}

/** 商机解锁流水行 */
export interface OpportunityUnlockRow {
  opportunity_id: number;
  unlock_type: string;
  unlocked_at: Date;
}

export class OpportunitiesRepo {
  constructor(private pool: Pool) {}

  /**
   * 未过期商机列表（有界 80 条，按截止时间升序）
   *
   * R3' B2：原 `codeId` 入参走 `旧品类字典表` 定级别 + `旧商机桥表`
   * 做 levelN_id 等值过滤，随字典退役整段摘除（商机表无 UGT 列可接盘，见 route 注释）。
   */
  async listOpportunities(): Promise<OpportunityListItemRow[]> {
    const [rows] = await this.pool.query(
      `SELECT DISTINCT
         o.id, o.title, o.reference, o.notice_type, o.agency, o.country,
         o.deadline, o.deadline_ts, o.deadline_sec, o.estimated_value, o.description,
         o.industry, o.source_url
       FROM crm_bid_opportunities o
       WHERE ${ACTIVE_OPP_WHERE}
       ORDER BY (o.deadline_sec = 0), o.deadline_sec ASC, o.id DESC
       LIMIT 80`,
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
              source_url, ai_products, ai_analysis,
              documents, external_links, contacts, update_time
       FROM crm_bid_opportunities WHERE id = ? LIMIT 1`,
      [opportunityId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 按 id 查商机存在性（解锁入口先验存在；字段拉取交给 findFullById）*/
  async findById(opportunityId: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      "SELECT id FROM crm_bid_opportunities WHERE id = ? LIMIT 1",
      [opportunityId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /*
   * R3' B3 删除：upsertInterestCode（兴趣码 upsert，写 code_id）。
   * 删的理由不是「用了字典」这么简单：它是零调用者的死代码（git grep 全仓仅命中定义本身），
   * 且与唯一的活路径（旧字典版 interest.ts 的 persistUserInterestCodes） 语义不一致——
   * 它走固定 weight=2.50 / 重复 +0.50，绕过了 T-E3 的白名单与 LEAST(500) 软上限。
   * 留着就是一个陷阱：谁哪天拿它去接解锁流，会静默绕过两道闸门。活路径只保留一条。
   */
}
