/**
 * 098: 权益体系重设计 · 目录重组 + 矩阵取值（数据迁移，幂等）
 * benefit-matrix-redesign
 *
 * @description 落地 docs/superpowers/specs/2026-09-25-权益体系重新设计-档位体验与矩阵设计.md。
 *              本轮只改「取值 + 启用态 + 名称」，不增删任何行/格，故 crm_benefit_catalog(21)/
 *              crm_plan_catalog(7)/crm_plan_benefits(147)/crm_service_catalog(16) 绝对数量不变，
 *              scripts/verify-benefit-constraints.ts 无需改动。
 *
 *              1) ai_summary 三态收紧（enum：0=无/1=部分脱敏teaser/2=完整）：
 *                 free 1→0（免费档不给摘要）、starter/pro 0→1（低档给脱敏 teaser）。
 *                 1299(unlimited)/8800(business) 维持 2（完整），已正确不动。
 *
 *              2) 检索/组织类按新分档：
 *                 - advanced_keyword_search：starter/pro 由 1/2→0（1299+ 才作卖点）；
 *                 - favorite_monitor 改名「收藏公告」并全档=1（收藏人人可用）；
 *                 - alert_service 改名「主动推送/监控」，pro/unlimited 由 1/2→0（仅 8800 保留）。
 *
 *              3) 甲类 5 项 + 人人可用 2 项移出矩阵（is_active=0，不删行以保 FK 与历史）：
 *                 ai_tender_analysis / expert_consult / dedicated_advisor / tech_support /
 *                 procurement_consult / api_access / source_url_view / unspsc_cpv。
 *                 （tech_support、procurement_consult 被服务目录 grant_benefit_code 外键引用，
 *                  仅停用展示、不删行，服务下单充值逻辑不受影响。）
 *
 *              幂等：格子用 INSERT ... ON DUPLICATE KEY UPDATE；改名/退役用 UPDATE。可安全重跑。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

/** 需改取值的格：[plan_code, benefit_code, value_level]（均为 enum，只填 value_level）。 */
const CELLS: Array<[string, string, number]> = [
  // 1) ai_summary 三态
  ["free", "ai_summary", 0],
  ["starter", "ai_summary", 1],
  ["pro", "ai_summary", 1],
  // 2) 高级关键词搜索：低档收回（1299+ 才给，unlimited/business 维持既有 2 不动）
  ["starter", "advanced_keyword_search", 0],
  ["pro", "advanced_keyword_search", 0],
  // 收藏公告：全档=1（pro/unlimited/business 已是 1，补 free/starter）
  ["free", "favorite_monitor", 1],
  ["starter", "favorite_monitor", 1],
  // 主动推送/监控：仅 8800 保留（business 维持 2），收回 pro/unlimited
  ["pro", "alert_service", 0],
  ["unlimited", "alert_service", 0],
];

/** 权益改名（拆分"收藏人人 / 监控 8800"的语义）。 */
const RENAMES: Array<[string, string]> = [
  ["favorite_monitor", "收藏公告"],
  ["alert_service", "主动推送/监控"],
];

/** 移出矩阵（停用展示，不删行）。 */
const RETIRED: string[] = [
  "ai_tender_analysis",
  "expert_consult",
  "dedicated_advisor",
  "tech_support",
  "procurement_consult",
  "api_access",
  "source_url_view",
  "unspsc_cpv",
];

export const migration: Migration = {
  version: 98,
  name: "benefit-matrix-redesign",
  async up(dbPool: Pool) {
    // 1) 矩阵取值（enum 只填 value_level，另两列置 NULL 满足 chk_one_value）
    for (const [planCode, benefitCode, level] of CELLS) {
      await dbPool.execute(
        `INSERT INTO crm_plan_benefits (plan_code, benefit_code, value_level)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE value_level = VALUES(value_level), value_num = NULL, value_amount = NULL`,
        [planCode, benefitCode, level],
      );
    }

    // 2) 权益改名
    for (const [code, nameZh] of RENAMES) {
      await dbPool.execute(`UPDATE crm_benefit_catalog SET name_zh = ? WHERE benefit_code = ?`, [nameZh, code]);
    }

    // 3) 甲类/人人可用项移出矩阵（is_active=0，保行保 FK）
    await dbPool.query(
      `UPDATE crm_benefit_catalog SET is_active = 0 WHERE benefit_code IN (${RETIRED.map(() => "?").join(",")})`,
      RETIRED,
    );

    console.log(
      `[migration-098] 权益重设计完成：ai_summary 三态收紧、收藏/监控拆分改名、${RETIRED.length} 项移出矩阵（不增删行，verify-benefit-constraints 绝对值不变）`,
    );
  },
};
