/**
 * 054: 会员套餐初始化
 * membership-plans-seed
 *
 * 修复审查报告 F14：套餐数据原由启动期 seedsPhase 写入，该阶段禁用后
 * 新环境 crm_membership_plans 为空，会员购买/升级/权益全链路瘫痪
 * （getFreeQuota 的 || 3 兜底会静默掩盖空表）。
 * 与原 seedMembershipPlans 语义一致：仅当表为空时写入默认套餐，
 * 已有配置的库不做任何覆盖（运维调价为准）。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 54,
  name: "membership-plans-seed",
  async up(dbPool: Pool) {
    const [countRows] = await dbPool.query("SELECT COUNT(*) AS total FROM crm_membership_plans");
    const total = Number((countRows as Array<{ total: number }>)[0]?.total || 0);
    if (total > 0) {
      console.log("[migration-054] crm_membership_plans 已有配置，跳过初始化");
      return;
    }

    await dbPool.execute(`
      INSERT IGNORE INTO crm_membership_plans
        (plan_code, name, description, price, currency, duration_days, unlock_quota, free_quota, plan_type, sort_order, is_active)
      VALUES
        ('free', '基础体验版', '免费注册供应商，浏览公告目录与摘要。', 0, 'CNY', NULL, 0, 0, 'free', 1, 0),
        ('single_99', '单次解锁·首单特惠', '首次购买专享价，解锁查看 1 条完整采购订单，含原始招标链接与中文解析报告。购买后 7 天内升级标讯个人会员可抵扣本单费用。', 99, 'CNY', NULL, 1, 0, 'single', 100, 1),
        ('single_89', '单点解锁', '单条查看完整采购详情与机构信息。', 89, 'CNY', NULL, 1, 0, 'single', 2, 0),
        ('week_299_21', '抢单周卡', '7 天内 21 条订单额度，适合集中筛单。', 299, 'CNY', 7, 21, 0, 'subscription', 4, 0),
        ('annual_5600', '企业至尊年卡', '全年最高 1095 条订单额度，适合团队稳定使用。', 5600, 'CNY', 365, 1095, 0, 'subscription', 5, 0),
        ('annual_manual_8800', '年度人工顾问服务', '含线索对接指导、投标机会分析、合同流程、企业转账确认及微信服务群。', 8800, 'CNY', 365, 0, 0, 'subscription', 6, 0),
        ('single_199', '单次解锁卡', '购买1次解锁查看完整采购订单的额度，可查看原始招标链接、下载标书文件，含中文解析报告。', 199, 'CNY', NULL, 1, 0, 'single', 101, 1),
        ('annual_799', '标讯个人会员', '全年最高解锁 100 条完整采购订单额度，可查看原始招标链接、下载标书文件，含中文解析报告。\\n①加入外贸交流群；\\n②群内客服答疑。', 799, 'CNY', 365, 100, 0, 'bundle', 102, 0),
        ('annual_8800', '标讯企业会员-基础版', '全年最高解锁365条完整采购订单额度，可查看原始招标链接、下载标书文件，含中文解析报告。适合团队稳定使用。\\n①购买后入驻平台供应商库，获取组建联合体投标服务。\\n②专属客服。', 8800, 'CNY', 365, 365, 0, 'subscription', 103, 0),
        ('annual_16800', '标讯企业会员-旗舰版', '全年最高解锁 365 条完整采购订单额度，可查看原始招标链接、下载标书文件，含中文解析报告。适合团队稳定使用。\\n①提供一对一会员专属服务群：投标顾问、专业拆标师、专属客服。\\n②入驻平台供应商库，协助撮合组建联合体投标。\\n③赠送一次UNGM注册服务。\\n本套餐支持企业合同签约、对公转账并开具正规发票。', 16800, 'CNY', 365, 365, 0, 'bundle', 104, 0),
        ('annual_26800', '标讯企业会员-尊享版', '全年最高解锁 365 条完整采购订单额度，可查看原始招标链接、下载标书文件，含中文解析报告。适合团队稳定使用。\\n①提供一对一会员专属服务群：投标顾问、专业拆标师、专属客服。\\n②入驻平台供应商库，协助撮合组建联合体投标。\\n③赠送一次UNGM注册服务。\\n④提供一次投标陪跑服务；（价值26800元）\\n本套餐支持企业合同签约、对公转账并开具正规发票。', 26800, 'CNY', 365, 365, 0, 'bundle', 105, 0),
        ('annual_8', '标讯年度会员', '全年最高解锁 365 条完整采购订单额度，可查看原始招标链接、下载标书文件，含中文解析报告。适合团队稳定使用。\\n①购买后入驻平台供应商库，获取组建联合体投标服务。\\n②专属客服。', 8800, 'CNY', 365, 365, 0, 'bundle', 106, 1)
    `);
    console.log("[migration-054] crm_membership_plans 初始化完成（仅空表时执行）");
  },
};
