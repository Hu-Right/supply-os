/**
 * 迁移 042 — 供应商资料完整度改版（100 分制加权分）
 *
 * @module server/db/migrations/042-supplier-quality-score-100
 * @description 2026-11-18 用户确认的新口径（原 STORED 生成列：16 项 ×5 = 80 分、字段同权）：
 *              ① 可搜索匹配 45：行业 10 · 产品 7 · 品目码阶梯 0/6/11/15 · 资质阶梯 0/5/9/13
 *              ② 可触达     25：联系人 6 · 电话 6 · 邮箱 6 · 职位 3 · 官网 4
 *              ③ 可信信息   20：信用代码 8 · 法人 4 · 成立日期 3 · 注册资本 3 · 执照 2
 *              ④ 地域完整   10：国家 1 · 省 2 · 市 2 · 经营地址 5
 *              合计 100 分。
 *
 *              由于品目码/资质条数来自其它表，生成列无法表达 → 改为普通列，
 *              由后台服务层（server/src/modules/supplier/quality.ts）统一计算并落库；
 *              本迁移只做列定义变更，存量回填由后台侧分批脚本完成（旧值已备份
 *              zz_bak_supplier_quality_20261118）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

const TABLE = "supplier";
const COLUMN = "data_quality_score";

async function hasColumn(pool: Pool, table: string, column: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

export const migration: Migration = {
  version: 42,
  name: "supplier_quality_score_100",
  async up(dbPool: Pool): Promise<void> {
    if (await hasColumn(dbPool, TABLE, COLUMN)) {
      // 生成列不能直接 MODIFY 成普通列：先删后加
      await dbPool.query(`ALTER TABLE \`${TABLE}\` DROP COLUMN \`${COLUMN}\``);
    }
    await dbPool.query(
      `ALTER TABLE \`${TABLE}\`
         ADD COLUMN \`${COLUMN}\` DECIMAL(5,2) NOT NULL DEFAULT 0.00
         COMMENT '资料完整度评分（100 分制加权，服务层计算落库；见 supplier/quality.ts）'`,
    );
    console.log("[migration 042] supplier.data_quality_score 已改为 100 分制普通列（默认 0）");
  },
};
