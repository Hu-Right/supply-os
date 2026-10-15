/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 用户行业偏好数据访问层
 * User Preferences Repository
 *
 * @module repos/user-prefs.repo
 */
import type { Pool } from "mysql2/promise";

export interface UserIndustryPrefsRow {
  level1_id: number | null;
  level2_id: number | null;
  level3_id: number | null;
  level4_id: number | null;
  level5_id: number | null;
  /** 最深已选 UGT 节点码（码版偏好的唯一选择键）；所属大类由码前缀推导（industry-scope），不再落库 */
  commodity_code: string | null;
  updated_at: Date | null;
}

export class UserPrefsRepo {
  constructor(private pool: Pool) {}

  /** 查询用户行业偏好 */
  async getIndustryPrefs(userId: number): Promise<UserIndustryPrefsRow | null> {
    const [rows] = await this.pool.query(
      "SELECT level1_id, level2_id, level3_id, level4_id, level5_id, commodity_code, updated_at FROM crm_user_industry_prefs WHERE user_id = ? LIMIT 1",
      [userId],
    );
    return (rows as UserIndustryPrefsRow[])[0] ?? null;
  }

  /** 清除用户行业偏好 */
  async deleteIndustryPrefs(userId: number): Promise<void> {
    await this.pool.execute("DELETE FROM crm_user_industry_prefs WHERE user_id = ?", [userId]);
  }

  /**
   * 写入/更新用户行业偏好（码版）。
   * @param commodityCode 最深已选 UGT 节点码；所属大类（L1 码）由消费方从码前缀推导，
   *                      不再单独落库（2026-10-15 G 码退役，group_code 列随批次 4 DDL 删除）。
   *                      旧行的 levelN_id（旧品类字典行 id）随字典退役恒置 NULL——
   *                      INSERT 与 ODKU 两侧都显式置空，避免「新码旧 id」两套键并存分叉。
   */
  async upsertIndustryPrefs(userId: number, commodityCode: string | null): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_user_industry_prefs
         (user_id, level1_id, level2_id, level3_id, level4_id, level5_id, commodity_code)
       VALUES (?, NULL, NULL, NULL, NULL, NULL, ?)
       ON DUPLICATE KEY UPDATE
         level1_id = NULL, level2_id = NULL, level3_id = NULL, level4_id = NULL, level5_id = NULL,
         commodity_code = VALUES(commodity_code), updated_at = NOW()`,
      [userId, commodityCode],
    );
  }
}
