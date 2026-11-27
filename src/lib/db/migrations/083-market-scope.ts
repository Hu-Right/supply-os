/**
 * 迁移 083 · 目标市场字典表（market_scope）
 *
 * @module lib/db/migrations/083-market-scope
 * @description 2026-11-27：诊断表单「计划投标的目标市场」原先硬编码在
 *              `shared/constants/diagnosis-dimensions.ts` 的 QUAL_MARKET_SCOPES，
 *              加一个市场要改代码 + 七语言键。改为字典表：
 *              表单选项、校验、报告标签统一读本表（`is_active=1`，按 sort_order）。
 *              首版按常量原样播种 27 条，行为不变；以后加市场只需 INSERT 一行。
 *              幂等：表已存在不重建；种子只补缺，不覆盖运营改动过的名称/排序。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

/** 首版 27 个市场（code / 中文名 / 英文名），顺序即默认排序 */
const SEED: ReadonlyArray<readonly [string, string, string]> = [
  ["EU", "欧盟", "European Union"],
  ["UK", "英国", "United Kingdom"],
  ["US", "美国", "United States"],
  ["CA", "加拿大", "Canada"],
  ["EAEU", "欧亚经济联盟", "Eurasian Economic Union"],
  ["GCC", "海湾国家", "Gulf Cooperation Council"],
  ["SA", "沙特", "Saudi Arabia"],
  ["AU", "澳大利亚", "Australia"],
  ["NZ", "新西兰", "New Zealand"],
  ["JP", "日本", "Japan"],
  ["KR", "韩国", "South Korea"],
  ["IN", "印度", "India"],
  ["BR", "巴西", "Brazil"],
  ["TH", "泰国", "Thailand"],
  ["ID", "印度尼西亚", "Indonesia"],
  ["NG", "尼日利亚", "Nigeria"],
  ["DE", "德国", "Germany"],
  ["CN", "中国", "China"],
  ["ZA", "南非", "South Africa"],
  ["AU/NZ", "澳大利亚及新西兰", "Australia & New Zealand"],
  ["PH", "菲律宾", "Philippines"],
  ["FR", "法国", "France"],
  ["KE", "肯尼亚", "Kenya"],
  ["MX", "墨西哥", "Mexico"],
  ["AE", "阿联酋", "United Arab Emirates"],
  ["MY", "马来西亚", "Malaysia"],
  ["VN", "越南", "Vietnam"],
];

export const migration: Migration = {
  version: 83,
  name: "market_scope_dictionary",
  async up(dbPool: Pool): Promise<void> {
    await dbPool.query(
      `CREATE TABLE IF NOT EXISTS market_scope (
         code VARCHAR(16) NOT NULL PRIMARY KEY COMMENT '市场码（与 supplier_certifications.scope 同值域）',
         label_zh VARCHAR(64) NOT NULL COMMENT '中文展示名',
         label_en VARCHAR(64) NULL COMMENT '英文名（报告/导出用；页面统一中文）',
         sort_order INT NOT NULL DEFAULT 100 COMMENT '升序展示',
         is_active TINYINT(1) NOT NULL DEFAULT 1,
         created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         KEY idx_market_scope_active_sort (is_active, sort_order)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='目标市场字典'`,
    );

    for (let i = 0; i < SEED.length; i += 1) {
      const [code, zh, en] = SEED[i];
      await dbPool.query(
        `INSERT INTO market_scope (code, label_zh, label_en, sort_order)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE code = code`,
        [code, zh, en, (i + 1) * 10],
      );
    }
  },
};
