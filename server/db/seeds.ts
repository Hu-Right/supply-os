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
 * - 会员计划：INSERT IGNORE（仅在表为空时初始化，绝不覆盖已有数据）
 * - 翻译水位：INSERT IGNORE（仅首次写入，重启不覆写）
 *
 * 重要：会员计划配置以数据库中实际数据为准，种子文件仅用于首次建库时的兜底初始化，
 *       后续任何套餐调整应通过数据库直接操作，种子文件不参与运行时写入。
 */
export async function runSeeds(pool: Pool, options: { enabled: boolean }): Promise<void> {
  if (!options.enabled) {
    console.log("[seeds] 种子数据已禁用 (SEED_ENABLED=off)");
    return;
  }

  await seedMembershipPlans(pool);
  // 翻译水位种子在 ensureProcurementSchema 中已处理（INSERT IGNORE，幂等）
}

/**
 * 会员计划种子数据（仅初始化，不覆盖）
 * 使用 INSERT IGNORE：若 plan_code 已存在则跳过，不修改任何已有记录。
 * 会员计划的增删改由数据库运维直接管理，种子文件不作为配置源。
 */
async function seedMembershipPlans(pool: Pool): Promise<void> {
  // 先检查表是否已有数据，有则完全跳过写入
  const [countRows] = await pool.query("SELECT COUNT(*) AS total FROM crm_membership_plans");
  const total = Number((countRows as { total: number }[])[0]?.total || 0);
  if (total > 0) {
    console.log(`[seeds] crm_membership_plans 已有 ${total} 条记录，跳过种子初始化（以数据库实际配置为准）`);
    return;
  }

  // 表为空时才执行初始化写入
  await pool.execute(`
    INSERT IGNORE INTO crm_membership_plans
      (plan_code, name, description, price, duration_days, unlock_quota, free_quota, plan_type, sort_order, is_active)
    VALUES
      ('free', '基础体验版', '免费注册供应商，浏览目录并免费解锁 3 条完整订单。', 0, NULL, 3, 3, 'free', 0, 1),
      ('single_89', '单点解锁', '单条查看完整采购详情与机构信息。', 89, NULL, 1, 0, 'single', 10, 1),
      ('trial_99_3', '尝鲜特惠包', '适合初步测试转化率，3 条订单额度。', 99, NULL, 3, 0, 'bundle', 20, 1),
      ('week_299_21', '抢单周卡', '7 天内 21 条订单额度，适合集中筛单。', 299, 7, 21, 0, 'subscription', 30, 1),
      ('annual_5600', '企业至尊年卡', '全年最高 1095 条订单额度，适合团队稳定使用。', 5600, 365, 1095, 0, 'subscription', 40, 1),
      ('annual_8800', '年度顾问服务', '付费服务包括：①获取采购订单的详情资料，包括原始招标地址和招标文件附件资料等；②提供订单的深度中文解析报告，辅助快速判断是否可投；③会员专属服务群，一对一答疑支持；④支付提供线上合同签约、对公转账确认。', 8800, 365, 0, 0, 'manual', 45, 1),
      ('annual_manual_8800', '年度人工顾问服务', '含线索对接指导、投标机会分析、合同流程、企业转账确认及微信服务群。', 8800, 365, 0, 0, 'manual', 50, 1)
  `);
  console.log("[seeds] crm_membership_plans 初始化完成（仅首次建库时执行）");
}
