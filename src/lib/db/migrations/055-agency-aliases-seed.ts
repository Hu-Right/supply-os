/**
 * 055: 机构别名映射初始化
 * agency-aliases-seed
 *
 * 修复审查报告 F15：别名数据原由启动期 agencyAliasPhase 写入，该阶段
 * 禁用后新环境 crm_agency_aliases 为空，搜索机构归一化（agency_std）与
 * 机构过滤/聚合失真。数据源 src/lib/data/agency-i18n/aliases.ts 保持不变，
 * 语义与原 seedAgencyAliases 一致：新别名写入，已有别名仅刷新
 * canonical 与多语言名称（不覆盖手动修改的归并关系）。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";
import { AGENCY_ALIAS_GROUPS } from "../../data/agency-i18n/aliases";

export const migration: Migration = {
  version: 55,
  name: "agency-aliases-seed",
  async up(dbPool: Pool) {
    let totalUpserted = 0;
    for (const group of AGENCY_ALIAS_GROUPS) {
      const i18nJson = JSON.stringify(group.i18n);
      for (const alias of group.aliases) {
        const [result] = await dbPool.query(
          `INSERT INTO crm_agency_aliases (canonical, alias, name_i18n)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE canonical = VALUES(canonical), name_i18n = VALUES(name_i18n)`,
          [group.canonical, alias.toUpperCase(), i18nJson],
        );
        totalUpserted += Number((result as { affectedRows?: number })?.affectedRows || 0);
      }
    }
    console.log(`[migration-055] crm_agency_aliases 初始化完成（${totalUpserted} 行写入/刷新）`);
  },
};
