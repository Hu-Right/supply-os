/**
 * AI 摘要缓存数据访问层 v2
 * @module lib/repos/ai-summary.repo
 * @description 操作 crm_notice_ai_summaries 表（user_id + notice_id 唯一）。
 *              支持 6 维度：核心交付/资质门槛/商务要素/竞争格局/投标策略/风险提示。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export interface AiSummaryRow extends RowDataPacket {
  id: number;
  user_id: number;
  notice_id: number;
  core_deliverables: string | null;
  key_qualifications: string | null;
  payment_cycle: string | null;
  competitive_landscape: string | null;
  bid_strategy: string | null;
  risk_alerts: string | null;
  model: string;
  provider_base_url: string;
  input_tokens: number | null;
  output_tokens: number | null;
}

export interface AiSummaryInput {
  userId: number;
  noticeId: number;
  coreDeliverables: string;
  keyQualifications: string;
  paymentCycle: string;
  competitiveLandscape: string;
  bidStrategy: string;
  riskAlerts: string;
  model: string;
  providerBaseUrl: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
}

export class AiSummaryRepo {
  constructor(private pool: Pool) {}

  /** 查缓存（无则 null） */
  async find(userId: number, noticeId: number): Promise<AiSummaryRow | null> {
    const [rows] = await this.pool.query(
      "SELECT * FROM crm_notice_ai_summaries WHERE user_id = ? AND notice_id = ? LIMIT 1",
      [userId, noticeId],
    );
    return (rows as AiSummaryRow[])[0] ?? null;
  }

  /** UPSERT 分析结果（6 维度） */
  async upsert(input: AiSummaryInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO crm_notice_ai_summaries
         (user_id, notice_id, core_deliverables, key_qualifications, payment_cycle,
          competitive_landscape, bid_strategy, risk_alerts,
          model, provider_base_url, input_tokens, output_tokens)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         core_deliverables = VALUES(core_deliverables),
         key_qualifications = VALUES(key_qualifications),
         payment_cycle = VALUES(payment_cycle),
         competitive_landscape = VALUES(competitive_landscape),
         bid_strategy = VALUES(bid_strategy),
         risk_alerts = VALUES(risk_alerts),
         model = VALUES(model),
         provider_base_url = VALUES(provider_base_url),
         input_tokens = VALUES(input_tokens),
         output_tokens = VALUES(output_tokens),
         created_at = CURRENT_TIMESTAMP`,
      [
        input.userId, input.noticeId, input.coreDeliverables, input.keyQualifications,
        input.paymentCycle, input.competitiveLandscape, input.bidStrategy, input.riskAlerts,
        input.model, input.providerBaseUrl,
        input.inputTokens ?? null, input.outputTokens ?? null,
      ],
    );
  }

  /** 删除缓存（强制重新分析时用） */
  async remove(userId: number, noticeId: number): Promise<void> {
    await this.pool.query(
      "DELETE FROM crm_notice_ai_summaries WHERE user_id = ? AND notice_id = ?",
      [userId, noticeId],
    );
  }

  // ── AI 适配评分 ──

  /** 查评分缓存 */
  async findScore(userId: number, noticeId: number): Promise<(AiSummaryRow & { score_reasons: string | null }) | null> {
    const [rows] = await this.pool.query(
      "SELECT * FROM crm_notice_ai_summaries WHERE user_id = ? AND notice_id = ? LIMIT 1",
      [userId, noticeId],
    );
    return (rows as (AiSummaryRow & { score_reasons: string | null })[])[0] ?? null;
  }

  /** UPSERT 评分 */
  async upsertScore(input: {
    userId: number; noticeId: number;
    qualification: number; experience: number; certification: number;
    region: number; scale: number; delivery: number; price: number;
    overall: number; reasons: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO crm_notice_ai_summaries
         (user_id, notice_id, score_qualification, score_experience, score_certification,
          score_region, score_scale, score_delivery, score_price, score_overall, score_reasons)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         score_qualification = VALUES(score_qualification),
         score_experience = VALUES(score_experience),
         score_certification = VALUES(score_certification),
         score_region = VALUES(score_region),
         score_scale = VALUES(score_scale),
         score_delivery = VALUES(score_delivery),
         score_price = VALUES(score_price),
         score_overall = VALUES(score_overall),
         score_reasons = VALUES(score_reasons),
         created_at = CURRENT_TIMESTAMP`,
      [
        input.userId, input.noticeId,
        input.qualification, input.experience, input.certification,
        input.region, input.scale, input.delivery, input.price,
        input.overall, input.reasons,
      ],
    );
  }

  /** 删除评分缓存 */
  async removeScore(userId: number, noticeId: number): Promise<void> {
    await this.pool.query(
      `UPDATE crm_notice_ai_summaries SET
         score_qualification = NULL, score_experience = NULL, score_certification = NULL,
         score_region = NULL, score_scale = NULL, score_delivery = NULL,
         score_price = NULL, score_overall = NULL, score_reasons = NULL
       WHERE user_id = ? AND notice_id = ?`,
      [userId, noticeId],
    );
  }
}
