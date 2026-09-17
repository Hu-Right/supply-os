/**
 * AI 摘要缓存数据访问层
 * @module lib/repos/ai-summary.repo
 * @description 操作 crm_notice_ai_summaries 表（user_id + notice_id 唯一）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export interface AiSummaryRow extends RowDataPacket {
  id: number;
  user_id: number;
  notice_id: number;
  core_deliverables: string | null;
  key_qualifications: string | null;
  payment_cycle: string | null;
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

  /** UPSERT 分析结果 */
  async upsert(input: AiSummaryInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO crm_notice_ai_summaries
         (user_id, notice_id, core_deliverables, key_qualifications, payment_cycle, risk_alerts,
          model, provider_base_url, input_tokens, output_tokens)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         core_deliverables = VALUES(core_deliverables),
         key_qualifications = VALUES(key_qualifications),
         payment_cycle = VALUES(payment_cycle),
         risk_alerts = VALUES(risk_alerts),
         model = VALUES(model),
         provider_base_url = VALUES(provider_base_url),
         input_tokens = VALUES(input_tokens),
         output_tokens = VALUES(output_tokens),
         created_at = CURRENT_TIMESTAMP`,
      [
        input.userId, input.noticeId, input.coreDeliverables, input.keyQualifications,
        input.paymentCycle, input.riskAlerts, input.model, input.providerBaseUrl,
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
}
