/**
 * 种子数据
 * Seed data
 *
 * @module server/db/seeds
 * @description 初始化种子数据（会员计划、翻译水位、底部社交媒体链接等）。
 *              与 schema.ts 的 DDL 分离，避免每次启动覆写手动调整的数据。
 *              通过 SEED_ENABLED 环境变量控制（默认 on）。
 */
import "server-only";
import type { Pool } from "mysql2/promise";

/**
 * 执行种子数据写入
 * - 会员计划：INSERT IGNORE（仅在表为空时初始化，绝不覆盖已有数据）
 * - 翻译水位：INSERT IGNORE（仅首次写入，重启不覆写）
 * - 底部社交媒体链接：INSERT IGNORE（仅首次写入）
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
  await seedFooterLinks(pool);
  // 翻译水位种子在 ensureProcurementSchema 中已处理（INSERT IGNORE，幂等）
}

/**
 * 会员计划种子数据（仅初始化，不覆盖）
 * 使用 INSERT IGNORE：若 plan_code 已存在则跳过，不修改任何已有记录。
 * 会员计划的增删改由数据库运维直接管理，种子文件不作为配置源。
 */
async function seedMembershipPlans(pool: Pool): Promise<void> {
  // 先检查表是否已有数据，有则静默跳过（以数据库实际配置为准，不产生启动日志噪音）
  const [countRows] = await pool.query("SELECT COUNT(*) AS total FROM crm_membership_plans");
  const total = Number((countRows as { total: number }[])[0]?.total || 0);
  if (total > 0) return;

  // 表为空时才执行初始化写入
  // 注意：以下数据与生产数据库 crm_membership_plans 表保持一致
  await pool.execute(`
    INSERT IGNORE INTO crm_membership_plans
      (plan_code, name, description, price, currency, duration_days, unlock_quota, free_quota, plan_type, sort_order, is_active)
    VALUES
      ('free', '基础体验版', '免费注册供应商，浏览目录并免费解锁 3 条完整订单。', 0, 'CNY', NULL, 3, 3, 'free', 1, 0),
      ('single_89', '单点解锁', '单条查看完整采购详情与机构信息。', 89, 'CNY', NULL, 1, 0, 'single', 2, 0),
      ('trial_99_3', '尝鲜特惠包', '适合初步测试转化率，3 条订单额度。', 99, 'CNY', NULL, 3, 0, 'bundle', 3, 0),
      ('week_299_21', '抢单周卡', '7 天内 21 条订单额度，适合集中筛单。', 299, 'CNY', 7, 21, 0, 'subscription', 4, 0),
      ('annual_5600', '企业至尊年卡', '全年最高 1095 条订单额度，适合团队稳定使用。', 5600, 'CNY', 365, 1095, 0, 'subscription', 5, 0),
      ('annual_manual_8800', '年度人工顾问服务', '含线索对接指导、投标机会分析、合同流程、企业转账确认及微信服务群。', 8800, 'CNY', 365, 0, 0, 'subscription', 6, 0),
      ('single_199', '单次解锁卡', '购买1次解锁查看完整采购订单的额度，可查看原始招标链接、下载标书文件，含中文解析报告。', 199, 'CNY', NULL, 1, 0, 'single', 101, 1),
      ('annual_799', '标讯个人会员', '全年最高解锁 100 条完整采购订单额度，可查看原始招标链接、下载标书文件，含中文解析报告。\n①加入外贸交流群；\n②群内客服答疑。', 799, 'CNY', 365, 100, 0, 'bundle', 102, 0),
      ('annual_8800', '标讯企业会员-基础版', '全年最高解锁365条完整采购订单额度，可查看原始招标链接、下载标书文件，含中文解析报告。适合团队稳定使用。\n①购买后入驻平台供应商库，获取组建联合体投标服务。\n②专属客服。', 8800, 'CNY', 365, 365, 0, 'subscription', 103, 0),
      ('annual_16800', '标讯企业会员-旗舰版', '全年最高解锁 365 条完整采购订单额度，可查看原始招标链接、下载标书文件，含中文解析报告。适合团队稳定使用。\n①提供一对一会员专属服务群：投标顾问、专业拆标师、专属客服。\n②入驻平台供应商库，协助撮合组建联合体投标。\n③赠送一次UNGM注册服务。\n④支付后加顾问，完成线上合同签约、对公转账确认。', 16800, 'CNY', 365, 365, 0, 'bundle', 104, 0),
      ('annual_26800', '标讯企业会员-尊享版', '全年最高解锁 365 条完整采购订单额度，可查看原始招标链接、下载标书文件，含中文解析报告。适合团队稳定使用。\n①提供一对一会员专属服务群：投标顾问、专业拆标师、专属客服。\n②入驻平台供应商库，协助撮合组建联合体投标。\n③赠送一次UNGM注册服务。\n④提供一次投标陪跑服务；（价值26800元）\n⑤支付后加顾问，完成线上合同签约、对公转账确认。', 26800, 'CNY', 365, 365, 0, 'bundle', 105, 0),
      ('annual_8', '标讯年度会员', '全年最高解锁 365 条完整采购订单额度，可查看原始招标链接、下载标书文件，含中文解析报告。适合团队稳定使用。\n①购买后入驻平台供应商库，获取组建联合体投标服务。\n②专属客服。', 8800, 'CNY', 365, 365, 0, 'bundle', 106, 1)
  `);
  console.log("[seeds] crm_membership_plans 初始化完成（仅首次建库时执行）");
}

/**
 * 底部社交媒体链接种子数据（仅初始化，不覆盖）
 * 使用 INSERT IGNORE：若记录已存在则跳过，不修改任何已有记录。
 * icon 字段对应 iconfont 的 class 名（iconfont.json 中的 font_class）。
 */
async function seedFooterLinks(pool: Pool): Promise<void> {
  // 先检查表是否已有数据，有则静默跳过（不产生启动日志噪音）
  const [countRows] = await pool.query("SELECT COUNT(*) AS total FROM crm.link");
  const total = Number((countRows as { total: number }[])[0]?.total || 0);
  if (total > 0) return;

  // 表为空时才执行初始化写入
  await pool.execute(`
    INSERT IGNORE INTO crm.link
      (name, url, icon, sort_order, status)
    VALUES
      ('Instagram', 'https://www.instagram.com', 'instagram', 1, 1),
      ('Pinterest', 'https://www.pinterest.com', 'pinterest', 2, 1),
      ('Facebook', 'https://www.facebook.com', 'facebook', 3, 1),
      ('YouTube', 'https://www.youtube.com', 'Youtube', 4, 1),
      ('WhatsApp', 'https://www.whatsapp.com', 'whatsapp', 5, 1),
      ('Twitter', 'https://www.twitter.com', 'tuite', 6, 1),
      ('TikTok', 'https://www.tiktok.com', 'tiktok', 7, 1)
  `);
  console.log("[seeds] crm.link 社交媒体链接初始化完成（仅首次建库时执行）");
}
