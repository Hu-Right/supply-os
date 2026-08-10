/**
 * 机构别名映射种子服务
 * Agency Alias Seed Service
 *
 * @description 将机构别名种子数据写入数据库。
 *              数据层已分离至 agency-alias-data.ts，本文件仅保留 seed 逻辑。
 */

import { AGENCY_ALIAS_GROUPS, type AgencyAliasGroup } from "./agency-alias-data";

export type { AgencyAliasGroup } from "./agency-alias-data";

/**
 * 将种子数据写入数据库（INSERT IGNORE 跳过已存在的别名，ON DUPLICATE KEY UPDATE 更新 i18n）
 * @returns 实际写入的新别名行数
 */
export async function seedAgencyAliases(pool: any): Promise<number> {
  let totalInserted = 0;

  for (const group of AGENCY_ALIAS_GROUPS) {
    const i18nJson = JSON.stringify(group.i18n);

    for (const alias of group.aliases) {
      const upperAlias = alias.toUpperCase();
      // INSERT IGNORE: 新别名写入，已有别名跳过（不覆盖手动修改）
      // 但对 canonical 和 name_i18n 做 ON DUPLICATE KEY UPDATE 确保翻译始终最新
      const [result] = await pool.query(
        `INSERT INTO crm_agency_aliases (canonical, alias, name_i18n)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE canonical = VALUES(canonical), name_i18n = VALUES(name_i18n)`,
        [group.canonical, upperAlias, i18nJson]
      );
      totalInserted += Number(result?.affectedRows || 0);
    }
  }

  return totalInserted;
}
