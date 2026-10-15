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
  /** 最深已选 UGT 节点码（码版偏好的唯一选择键）；所属大类由码前缀推导（industry-scope），不再落库。
   *  旧字典行 id 五列（level1_id~level5_id）已随 2026-10-15 扫尾批次物理 DROP——写入方此前
   *  在 INSERT/ODKU 两侧都显式置 NULL，线上 12 行全空，纯死列。 */
  commodity_code: string | null;
  updated_at: Date | null;
}

export class UserPrefsRepo {
  constructor(private pool: Pool) {}

  /** 查询用户行业偏好 */
  async getIndustryPrefs(userId: number): Promise<UserIndustryPrefsRow | null> {
    const [rows] = await this.pool.query(
      "SELECT commodity_code, updated_at FROM crm_user_industry_prefs WHERE user_id = ? LIMIT 1",
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
   *                      不再单独落库（2026-10-15 G 码退役，group_code 列已删）。
   *                      旧行的 levelN_id（旧品类字典行 id）五列已物理 DROP。
   */
  async upsertIndustryPrefs(userId: number, commodityCode: string | null): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_user_industry_prefs (user_id, commodity_code)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE
         commodity_code = VALUES(commodity_code), updated_at = NOW()`,
      [userId, commodityCode],
    );
  }
}
