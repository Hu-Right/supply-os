/**
 * 目标市场字典仓储（market_scope）
 *
 * @module lib/repos/market-scope.repo
 * @description 2026-11-27 起市场清单以表为准（迁移 083）：表单选项、校验白名单、
 *              报告标签统一读本表；`is_active=1` 按 sort_order 升序。
 *              表为空（未跑迁移的旧库）时返回空数组，调用方回退常量。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export interface MarketScopeRow {
  code: string;
  labelZh: string;
  labelEn: string | null;
  sortOrder: number;
}

export class MarketScopeRepo {
  constructor(private readonly pool: Pool) {}

  async listActive(): Promise<MarketScopeRow[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT code, label_zh, label_en, sort_order
         FROM market_scope
        WHERE is_active = 1
        ORDER BY sort_order, code`,
    );
    return rows.map((r) => ({
      code: String(r.code),
      labelZh: String(r.label_zh),
      labelEn: r.label_en == null ? null : String(r.label_en),
      sortOrder: Number(r.sort_order),
    }));
  }
}
