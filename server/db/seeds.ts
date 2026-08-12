/**
 * 种子数据
 * Seed data
 *
 * @module server/db/seeds
 * @description 初始化种子数据（会员计划、翻译水位等）。
 *              与 schema.ts 的 DDL 分离，避免每次启动覆写手动调整的数据。
 *              通过 SEED_ENABLED 环境变量控制（默认 on）。
 */
import type { Pool } from "mysql2/promise";

/**
 * 执行种子数据写入
 * - 会员计划：INSERT ... ON DUPLICATE KEY UPDATE（每次启动同步最新配置）
 * - 翻译水位：INSERT IGNORE（仅首次写入，重启不覆写）
 */
export async function runSeeds(pool: Pool, options: { enabled: boolean }): Promise<void> {
  if (!options.enabled) {
    console.log("[seeds] 种子数据已禁用 (SEED_ENABLED=off)");
    return;
  }

  await seedMembershipPlans(pool);
  // 翻译水位种子在 ensureProcurementSchema 中已处理（INSERT IGNORE，幂等）
}

/** 会员计划种子数据 */
async function seedMembershipPlans(pool: Pool): Promise<void> {
  await pool.execute(`
    INSERT INTO crm_membership_plans
      (plan_code, name, description, price, duration_days, unlock_quota, free_quota, plan_type, sort_order)
    VALUES
      ('free', '基础体验版', '免费注册供应商，浏览目录并免费解锁 3 条完整订单。', 0, NULL, 3, 3, 'free', 0),
      ('single_89', '单点解锁', '单条查看完整采购详情与机构信息。', 89, NULL, 1, 0, 'single', 10),
      ('trial_99_3', '尝鲜特惠包', '适合初步测试转化率，3 条订单额度。', 99, NULL, 3, 0, 'bundle', 20),
      ('week_299_21', '抢单周卡', '7 天内 21 条订单额度，适合集中筛单。', 299, 7, 21, 0, 'subscription', 30),
      ('annual_5600', '企业至尊年卡', '全年最高 1095 条订单额度，适合团队稳定使用。', 5600, 365, 1095, 0, 'subscription', 40),
      ('annual_8800', '年度顾问服务', '付费服务包括：①获取采购订单的详情资料，包括原始招标地址和招标文件附件资料等；②提供订单的深度中文解析报告，辅助快速判断是否可投；③会员专属服务群，一对一答疑支持；④支付提供线上合同签约、对公转账确认。', 8800, 365, 0, 0, 'manual', 45),
      ('annual_manual_8800', '年度人工顾问服务', '含线索对接指导、投标机会分析、合同流程、企业转账确认及微信服务群。', 8800, 365, 0, 0, 'manual', 50)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      description = VALUES(description),
      price = VALUES(price),
      duration_days = VALUES(duration_days),
      unlock_quota = VALUES(unlock_quota),
      free_quota = VALUES(free_quota),
      plan_type = VALUES(plan_type),
      sort_order = VALUES(sort_order),
      updated_at = NOW()
  `);
  await pool.execute(`
    UPDATE crm_membership_plans
    SET
      name = CASE plan_code
        WHEN 'free' THEN '基础体验版'
        WHEN 'single_89' THEN '单点解锁'
        WHEN 'trial_99_3' THEN '尝鲜特惠包'
        WHEN 'week_299_21' THEN '抢单周卡'
        WHEN 'annual_5600' THEN '企业至尊年卡'
        ELSE name
      END,
      description = CASE plan_code
        WHEN 'free' THEN '免费注册供应商，浏览目录并免费解锁 3 条完整订单。'
        WHEN 'single_89' THEN '单条查看完整采购详情与机构信息。'
        WHEN 'trial_99_3' THEN '适合初步测试转化率，3 条订单额度。'
        WHEN 'week_299_21' THEN '7 天内 21 条订单额度，适合集中筛单。'
        WHEN 'annual_5600' THEN '全年最高 1095 条订单额度，适合团队稳定使用。'
        ELSE description
      END,
      updated_at = NOW()
    WHERE plan_code IN ('free','single_89','trial_99_3','week_299_21','annual_5600','annual_8800','annual_manual_8800')
  `);
}
