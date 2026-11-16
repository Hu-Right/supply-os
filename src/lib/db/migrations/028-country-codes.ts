/**
 * 迁移 028 · 国家代码列（交付国家 / 采购主体注册国家）
 *
 * @module server/db/migrations/028-country-codes
 * @description 国家原先是自由文本，存在“中国 / China / CN / 中华人民共和国”多种写法。
 *              新增 ISO 3166-1 alpha-2 代码列，并从存量文本回填；展示仍走本地化名称。
 *              - procurement_projects.delivery_country_code
 *              - procurement_buyers.country_code
 *              文本列保留：历史数据与旧接口继续可读。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";
import { guessCountryCode } from "@/shared/constants/countries";

export const migration: Migration = {
  version: 28,
  name: "country_codes",
  async up(dbPool: Pool): Promise<void> {
    await ensureColumn(
      dbPool,
      "procurement_projects",
      "delivery_country_code",
      "delivery_country_code char(2) DEFAULT NULL COMMENT '交付国家 ISO 3166-1 alpha-2；delivery_country 保留名称快照'",
    );
    await ensureColumn(
      dbPool,
      "procurement_buyers",
      "country_code",
      "country_code char(2) DEFAULT NULL COMMENT '注册国家 ISO 3166-1 alpha-2；country 保留名称快照'",
    );

    const [projects] = await dbPool.query(
      "SELECT id, delivery_country FROM procurement_projects WHERE (delivery_country_code IS NULL OR delivery_country_code = '') AND delivery_country IS NOT NULL AND delivery_country <> ''",
    );
    for (const row of projects as RowDataPacket[]) {
      const code = guessCountryCode(String(row.delivery_country));
      if (code) {
        await dbPool.query("UPDATE procurement_projects SET delivery_country_code = ? WHERE id = ?", [code, row.id]);
      }
    }

    const [buyers] = await dbPool.query(
      "SELECT id, country FROM procurement_buyers WHERE (country_code IS NULL OR country_code = '') AND country IS NOT NULL AND country <> ''",
    );
    for (const row of buyers as RowDataPacket[]) {
      const code = guessCountryCode(String(row.country));
      if (code) {
        await dbPool.query("UPDATE procurement_buyers SET country_code = ? WHERE id = ?", [code, row.id]);
      }
    }
  },
};
