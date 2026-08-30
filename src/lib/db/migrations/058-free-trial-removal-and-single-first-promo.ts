/**
 * 058: 移除免费试用 + 单次解锁首单特惠 + 下架尝鲜包
 * free-trial-removal-and-single-first-promo
 *
 * 三项产品决策（2026-08-30）：
 * 1. 移除"注册即送 3 条免费解锁"：free 套餐 free_quota → 0
 *    （免费额度是数据不是功能；服务层另行封堵 free 解锁路径）
 * 2. 新增 single_99（99 元/1次，首单特惠）：资格校验在 PaymentService
 *    （曾购/持有 single_% 订单即不合格），价格表保持服务端权威定价
 * 3. trial_99_3（99 元 3 条尝鲜包）与首单价易混淆，直接下架删除
 *
 * 幂等性：UPDATE 天然幂等；single_99 用 INSERT ... ON DUPLICATE KEY UPDATE
 * 保证重跑/已存在时仅刷新定义。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 58,
  name: "free-trial-removal-and-single-first-promo",
  async up(dbPool: Pool) {
    // 1) 移除免费额度（历史已用掉的免费解锁不回收，仅切断未来额度）
    await dbPool.execute(
      "UPDATE crm_membership_plans SET free_quota = 0 WHERE plan_code = 'free'",
    );

    // 2) 首单特惠套餐上架（排在 single_199 之前）
    await dbPool.execute(
      `INSERT INTO crm_membership_plans
        (plan_code, name, description, price, currency, duration_days, unlock_quota, free_quota, plan_type, sort_order, is_active)
       VALUES ('single_99', '单次解锁·首单特惠', '首次购买专享价，解锁查看 1 条完整采购订单，含原始招标链接与中文解析报告。购买后 7 天内升级标讯个人会员可抵扣本单费用。', 99, 'CNY', NULL, 1, 0, 'single', 100, 1)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), description = VALUES(description), price = VALUES(price),
         unlock_quota = VALUES(unlock_quota), plan_type = VALUES(plan_type),
         sort_order = VALUES(sort_order), is_active = VALUES(is_active)`,
    );

    // 3) 下架删除 trial_99_3（与首单价 99 混淆；is_active=0 已无销售，无历史订单依赖）
    await dbPool.execute(
      "DELETE FROM crm_membership_plans WHERE plan_code = 'trial_99_3'",
    );

    console.log("[migration-058] 免费额度已清零；single_99 首单特惠已上架；trial_99_3 已删除");
  },
};
