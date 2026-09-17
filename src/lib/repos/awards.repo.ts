/**
 * 中标数据访问层
 * Awards Repository
 *
 * @module repos/awards.repo
 * @description 提供中标记录的查询、写入、统计等操作。
 *              数据来源于爬虫脚本（scripts/crawl-awards/）写入的 crm_bid_awards 表。
 */
import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";

// ── 类型定义 ──

export interface AwardRow {
  id: number;
  source_platform: string;
  source_url: string | null;
  external_id: string | null;
  title: string;
  title_cn: string | null;
  reference: string | null;
  contract_no: string | null;
  agency: string | null;
  agency_full: string | null;
  country: string | null;
  award_date: string | null;
  contract_value: number | null;
  contract_value_usd: number | null;
  currency: string;
  description: string | null;
  description_cn: string | null;
  category: string | null;
  unspsc_code: string | null;
  industry: string | null;
  source_notice_id: string | null;
  raw_data: unknown;
  crawl_time: string;
}

export interface AwardWinnerRow {
  id: number;
  award_id: number;
  winner_name: string;
  winner_name_cn: string | null;
  winner_country: string | null;
  winner_type: string | null;
  registration_level: string | null;
  certifications: unknown;
  share_amount: number | null;
  share_currency: string | null;
}

export interface AwardWithWinners extends AwardRow {
  winners: AwardWinnerRow[];
}

/** 爬虫写入用的精简字段 */
export interface AwardInsert {
  source_platform: string;
  source_url?: string | null;
  external_id?: string | null;
  title: string;
  title_cn?: string | null;
  reference?: string | null;
  contract_no?: string | null;
  agency?: string | null;
  agency_full?: string | null;
  country?: string | null;
  award_date?: string | null;
  contract_value?: number | null;
  contract_value_usd?: number | null;
  currency?: string;
  description?: string | null;
  description_cn?: string | null;
  category?: string | null;
  unspsc_code?: string | null;
  industry?: string | null;
  source_notice_id?: string | null;
  raw_data?: unknown;
}

export interface WinnerInsert {
  winner_name: string;
  winner_name_cn?: string | null;
  winner_country?: string | null;
  winner_type?: string | null;
  registration_level?: string | null;
  certifications?: unknown;
  share_amount?: number | null;
  share_currency?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  website?: string | null;
}

/** 中标统计摘要 */
export interface AwardStats {
  total: number;
  total_value_usd: number;
  by_agency: Array<{ agency: string; count: number; total_usd: number }>;
  by_country: Array<{ country: string; count: number }>;
  by_month: Array<{ month: string; count: number; total_usd: number }>;
  top_winners: Array<{ name: string; count: number; total_usd: number; country: string | null }>;
}

// ── Repository ──

export class AwardsRepo {
  constructor(private pool: Pool) {}

  // ══════════ 查询 ══════════

  /** 分页查询中标记录 */
  async list(params: {
    page?: number;
    pageSize?: number;
    agency?: string;
    country?: string;
    keyword?: string;
    dateFrom?: string;
    dateTo?: string;
    minAmount?: number;
    maxAmount?: number;
    sortBy?: "award_date" | "contract_value_usd";
    sortDir?: "asc" | "desc";
  } = {}): Promise<{ items: AwardRow[]; total: number }> {
    const {
      page = 1, pageSize = 20,
      agency, country, keyword,
      dateFrom, dateTo, minAmount, maxAmount,
      sortBy = "award_date", sortDir = "desc",
    } = params;

    const conditions: string[] = ["1=1"];
    const values: unknown[] = [];

    if (agency) { conditions.push("agency = ?"); values.push(agency); }
    if (country) { conditions.push("country = ?"); values.push(country); }
    if (keyword) {
      conditions.push("(title LIKE ? OR title_cn LIKE ? OR reference LIKE ? OR contract_no LIKE ?)");
      const like = `%${keyword}%`;
      values.push(like, like, like, like);
    }
    if (dateFrom) { conditions.push("award_date >= ?"); values.push(dateFrom); }
    if (dateTo) { conditions.push("award_date <= ?"); values.push(dateTo); }
    if (minAmount != null) { conditions.push("contract_value_usd >= ?"); values.push(minAmount); }
    if (maxAmount != null) { conditions.push("contract_value_usd <= ?"); values.push(maxAmount); }

    const where = conditions.join(" AND ");
    const offset = (page - 1) * pageSize;
    const order = `${sortBy} ${sortDir === "asc" ? "ASC" : "DESC"}`;

    const [countRows] = await this.pool.query(
      `SELECT COUNT(*) AS total FROM crm_bid_awards WHERE ${where}`,
      values,
    );
    const total = Number((countRows as RowDataPacket[])[0]?.total || 0);

    const [rows] = await this.pool.query(
      `SELECT id, source_platform, source_url, external_id, title, title_cn,
              reference, contract_no, agency, agency_full, country,
              award_date, contract_value, contract_value_usd, currency,
              description, description_cn, category, unspsc_code, industry,
              source_notice_id, crawl_time
       FROM crm_bid_awards
       WHERE ${where}
       ORDER BY ${order}
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset],
    );

    return { items: rows as AwardRow[], total };
  }

  /** 按 ID 查中标详情（含中标商） */
  async findById(awardId: number): Promise<AwardWithWinners | null> {
    const [rows] = await this.pool.query(
      `SELECT * FROM crm_bid_awards WHERE id = ? LIMIT 1`,
      [awardId],
    );
    const award = (rows as AwardRow[])[0];
    if (!award) return null;

    const [winners] = await this.pool.query(
      `SELECT * FROM crm_bid_award_winners WHERE award_id = ?`,
      [awardId],
    );
    return { ...award, winners: winners as AwardWinnerRow[] };
  }

  /** 按 external_id + platform 查重（爬虫去重用） */
  async findByExternalId(platform: string, externalId: string): Promise<AwardRow | null> {
    const [rows] = await this.pool.query(
      `SELECT id FROM crm_bid_awards WHERE source_platform = ? AND external_id = ? LIMIT 1`,
      [platform, externalId],
    );
    return (rows as AwardRow[])[0] ?? null;
  }

  // ══════════ 统计 ══════════

  /** 全局统计摘要（用于前端仪表板） */
  async getStats(): Promise<AwardStats> {
    const [totalRow] = await this.pool.query(
      `SELECT COUNT(*) AS total, COALESCE(SUM(contract_value_usd), 0) AS total_value_usd
       FROM crm_bid_awards`,
    );
    const { total, total_value_usd } = (totalRow as RowDataPacket[])[0];

    const [byAgency] = await this.pool.query(
      `SELECT agency, COUNT(*) AS count, COALESCE(SUM(contract_value_usd), 0) AS total_usd
       FROM crm_bid_awards WHERE agency IS NOT NULL
       GROUP BY agency ORDER BY total_usd DESC LIMIT 20`,
    );

    const [byCountry] = await this.pool.query(
      `SELECT country, COUNT(*) AS count
       FROM crm_bid_awards WHERE country IS NOT NULL
       GROUP BY country ORDER BY count DESC LIMIT 20`,
    );

    const [byMonth] = await this.pool.query(
      `SELECT DATE_FORMAT(award_date, '%Y-%m') AS month,
              COUNT(*) AS count,
              COALESCE(SUM(contract_value_usd), 0) AS total_usd
       FROM crm_bid_awards WHERE award_date IS NOT NULL
       GROUP BY month ORDER BY month DESC LIMIT 24`,
    );

    const [topWinners] = await this.pool.query(
      `SELECT w.winner_name AS name, COUNT(*) AS count,
              COALESCE(SUM(a.contract_value_usd), 0) AS total_usd,
              w.winner_country AS country
       FROM crm_bid_award_winners w
       JOIN crm_bid_awards a ON a.id = w.award_id
       GROUP BY w.winner_name, w.winner_country
       ORDER BY total_usd DESC LIMIT 20`,
    );

    return {
      total: Number(total),
      total_value_usd: Number(total_value_usd),
      by_agency: byAgency as AwardStats["by_agency"],
      by_country: byCountry as AwardStats["by_country"],
      by_month: byMonth as AwardStats["by_month"],
      top_winners: topWinners as AwardStats["top_winners"],
    };
  }

  /** 按机构查中标记录 */
  async listByAgency(agency: string, limit = 50): Promise<AwardRow[]> {
    const [rows] = await this.pool.query(
      `SELECT id, title, title_cn, reference, agency, country, award_date,
              contract_value_usd, currency, category
       FROM crm_bid_awards WHERE agency = ?
       ORDER BY award_date DESC LIMIT ?`,
      [agency, limit],
    );
    return rows as AwardRow[];
  }

  /** 查中标商排行（按中标金额/次数） */
  async topWinners(limit = 20): Promise<Array<{
    name: string; country: string | null; count: number; total_usd: number;
  }>> {
    const [rows] = await this.pool.query(
      `SELECT w.winner_name AS name, w.winner_country AS country,
              COUNT(*) AS count,
              COALESCE(SUM(a.contract_value_usd), 0) AS total_usd
       FROM crm_bid_award_winners w
       JOIN crm_bid_awards a ON a.id = w.award_id
       GROUP BY w.winner_name, w.winner_country
       ORDER BY total_usd DESC LIMIT ?`,
      [limit],
    );
    return rows as Array<{ name: string; country: string | null; count: number; total_usd: number }>;
  }

  // ══════════ 写入（爬虫使用） ══════════

  /**
   * Upsert 中标记录 + 中标商
   * 使用 ON DUPLICATE KEY UPDATE 实现幂等写入。
   * @returns 写入或更新的 award ID
   */
  async upsertAward(award: AwardInsert, winners: WinnerInsert[] = []): Promise<number> {
    const cols = [
      "source_platform", "source_url", "external_id", "title", "title_cn",
      "reference", "contract_no", "agency", "agency_full", "country",
      "award_date", "contract_value", "contract_value_usd", "currency",
      "description", "description_cn", "category", "unspsc_code", "industry",
      "source_notice_id", "raw_data", "create_time", "update_time",
    ];
    const now = Math.floor(Date.now() / 1000);
    const vals = [
      award.source_platform, award.source_url ?? null, award.external_id ?? null,
      award.title, award.title_cn ?? null,
      award.reference ?? null, award.contract_no ?? null,
      award.agency ?? null, award.agency_full ?? null, award.country ?? null,
      award.award_date ?? null, award.contract_value ?? null, award.contract_value_usd ?? null,
      award.currency ?? "USD",
      award.description ?? null, award.description_cn ?? null,
      award.category ?? null, award.unspsc_code ?? null, award.industry ?? null,
      award.source_notice_id ?? null,
      award.raw_data ? JSON.stringify(award.raw_data) : null,
      now, now,
    ];

    const placeholders = cols.map(() => "?").join(", ");
    const updates = cols
      .filter((c) => !["source_platform", "external_id", "create_time"].includes(c))
      .map((c) => `${c} = VALUES(${c})`)
      .join(", ");

    const sql = `INSERT INTO crm_bid_awards (${cols.join(", ")})
                 VALUES (${placeholders})
                 ON DUPLICATE KEY UPDATE ${updates}, update_time = VALUES(update_time)`;

    const [result] = await this.pool.execute(sql, vals) as unknown as [ResultSetHeader];
    // insertId 在 UPDATE 场景下为 0，需要回查
    let awardId = result.insertId;
    if (!awardId && award.external_id) {
      const [rows] = await this.pool.query(
        `SELECT id FROM crm_bid_awards WHERE source_platform = ? AND external_id = ? LIMIT 1`,
        [award.source_platform, award.external_id],
      );
      awardId = Number((rows as RowDataPacket[])[0]?.id || 0);
    }

    // 写入中标商（先清后插，保证幂等）
    if (awardId > 0 && winners.length > 0) {
      await this.pool.execute(
        `DELETE FROM crm_bid_award_winners WHERE award_id = ?`,
        [awardId],
      );
      for (const w of winners) {
        await this.pool.execute(
          `INSERT INTO crm_bid_award_winners
             (award_id, winner_name, winner_name_cn, winner_country, winner_type,
              registration_level, certifications, share_amount, share_currency,
              contact_email, contact_phone, website)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            awardId, w.winner_name, w.winner_name_cn ?? null,
            w.winner_country ?? null, w.winner_type ?? null,
            w.registration_level ?? null,
            w.certifications ? JSON.stringify(w.certifications) : null,
            w.share_amount ?? null, w.share_currency ?? null,
            w.contact_email ?? null, w.contact_phone ?? null, w.website ?? null,
          ],
        );
      }
    }

    return awardId;
  }

  /** 批量 upsert（爬虫批量写入优化） */
  async upsertAwardsBatch(
    items: Array<{ award: AwardInsert; winners?: WinnerInsert[] }>,
  ): Promise<number> {
    let count = 0;
    for (const item of items) {
      await this.upsertAward(item.award, item.winners ?? []);
      count++;
    }
    return count;
  }
}
