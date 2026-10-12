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
  /** 品目大类码（UGT-G-xx）：可见性判定 industry-scope 的唯一输入。旧行可能为空（历史上没人写这列），
   *  由 ops 重导脚本补齐；补齐后写入链路必须同批带上它。 */
  group_code: string | null;
  updated_at: Date | null;
}

export class UserPrefsRepo {
  constructor(private pool: Pool) {}

  /** 查询用户行业偏好 */
  async getIndustryPrefs(userId: number): Promise<UserIndustryPrefsRow | null> {
    const [rows] = await this.pool.query(
      "SELECT level1_id, level2_id, level3_id, level4_id, level5_id, group_code, updated_at FROM crm_user_industry_prefs WHERE user_id = ? LIMIT 1",
      [userId],
    );
    return (rows as UserIndustryPrefsRow[])[0] ?? null;
  }

  /** 清除用户行业偏好 */
  async deleteIndustryPrefs(userId: number): Promise<void> {
    await this.pool.execute("DELETE FROM crm_user_industry_prefs WHERE user_id = ?", [userId]);
  }

  /**
   * 写入/更新用户行业偏好。
   * @param groupCode 由调用方从五级 id 换算好的品目大类码；换不出就传 null（仓储不猜、不兜底）。
   *                  INSERT 与 ON DUPLICATE 两边都要写：只写一处就会「首次保存有值、改一次偏好就丢」。
   */
  async upsertIndustryPrefs(userId: number, levels: (number | null)[], groupCode: string | null): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_user_industry_prefs (user_id, level1_id, level2_id, level3_id, level4_id, level5_id, group_code)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         level1_id = VALUES(level1_id), level2_id = VALUES(level2_id), level3_id = VALUES(level3_id),
         level4_id = VALUES(level4_id), level5_id = VALUES(level5_id),
         group_code = VALUES(group_code), updated_at = NOW()`,
      [userId, ...levels, groupCode],
    );
  }
}
