/**
 * 090: 会员套餐体系切换 V2（对齐《云境产品服务权益报价表_260921_V2》）
 * membership-plans-v2
 *
 * 产品裁决（2026-09-21，用户两次确认）：**旧版本权益全量作废，一切以新套餐为准**。
 * 不做"旧套餐到期自然过渡"：
 * - 全部旧 plan_code（含悬挂 code）物理删除；
 * - 引用旧 code 的活跃订阅/权益一律置 closed（存量持有人按新五档重新购买）；
 * - 由此失去活跃订阅的用户 membership_tier 落回 free；
 * - 支付订单历史保留（订单表只是流水，删除套餐行不影响其查询，仅不显示套餐名）。
 *
 * 新体系五档：免费注册(rank0) → 个人体验版129(rank1) → 个人标准版999(rank2, +历史中标)
 *           → 个人专业版1299(rank3, +AI适配评分) → 企业年度会员8800(rank4)。
 * benefit_rank 为功能门控单一事实源（见 lib/services/benefit-matrix.ts）。
 *
 * 幂等性：DELETE / UPDATE 均按条件收敛，重复执行无副作用；新套餐 INSERT IGNORE。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

/** 全部旧套餐 code（含本地库审计发现的悬挂 code：套餐行已删但订阅/权益仍引用） */
export const LEGACY_PLAN_CODES = [
  "single_99",
  "single_199",
  "single_89",
  "week_299_21",
  "annual_5600",
  "annual_799",
  "annual_8800",
  "annual_16800",
  "annual_26800",
  "annual_8",
  "annual_manual_8800",
  // 悬挂 code（历史已删行，但存量订阅/权益可能仍引用）
  "trial_99_3",
  "trial_3",
  "s",
  "manual_full_unlock",
];

export const migration: Migration = {
  version: 90,
  name: "membership-plans-v2",
  async up(dbPool: Pool) {
    // 1. 权益档位列：0免费 / 1体验 / 2标准 / 3专业 / 4企业
    await ensureColumn(
      dbPool,
      "crm_membership_plans",
      "benefit_rank",
      "benefit_rank INT NOT NULL DEFAULT 0 COMMENT '权益档位：0免费/1体验/2标准/3专业/4企业，功能门控单一事实源' AFTER plan_type",
    );

    // 2. 旧权益作废：引用旧 code 的活跃订阅/权益全部关闭（非退款，体系切换作废）
    const placeholders = LEGACY_PLAN_CODES.map(() => "?").join(",");
    await dbPool.execute(
      `UPDATE crm_user_subscriptions SET status = 'closed'
       WHERE plan_code IN (${placeholders}) AND status = 'active'`,
      LEGACY_PLAN_CODES,
    );
    await dbPool.execute(
      `UPDATE crm_user_entitlements SET status = 'closed'
       WHERE plan_code IN (${placeholders}) AND status = 'active'`,
      LEGACY_PLAN_CODES,
    );

    // 3. 失去活跃订阅的用户落回 free（与每日降级兜底任务同口径，立即生效）
    await dbPool.execute(`
      UPDATE crm_users u
      SET u.membership_tier = 'free'
      WHERE u.membership_tier = 'vip'
        AND NOT EXISTS (
          SELECT 1 FROM crm_user_subscriptions s
          WHERE s.user_id = u.id AND s.status = 'active'
            AND (s.expires_at IS NULL OR s.expires_at > NOW())
        )
    `);

    // 4. 旧套餐行物理删除（订阅/权益已在上两步收口；订单表仅存 code 字符串，不受影响）
    await dbPool.execute(
      `DELETE FROM crm_membership_plans WHERE plan_code IN (${placeholders})`,
      LEGACY_PLAN_CODES,
    );

    // 5. free 行改造为"免费注册体验"档（报价表免费档：脱敏采购摘要 + 相似机会）
    await dbPool.execute(`
      UPDATE crm_membership_plans
      SET name = '免费注册体验',
          description = '免费注册，查看脱敏采购摘要与相似机会，升级解锁完整采购订单。',
          is_active = 1, sort_order = 0, benefit_rank = 0
      WHERE plan_code = 'free'
    `);

    // 6. 新 4 档上架（均年订；"不限"以大额度复用现有额度记账，不发明新语义）
    await dbPool.execute(`
      INSERT IGNORE INTO crm_membership_plans
        (plan_code, name, description, price, currency, duration_days, unlock_quota, free_quota, plan_type, sort_order, is_active, benefit_rank)
      VALUES
        ('personal_trial_129', '个人体验版', '原文标讯查看 10 条（计额度），资格条件与原始文件看得全，先试水再升级。', 129, 'CNY', 365, 10, 0, 'subscription', 10, 1, 1),
        ('personal_std_999', '个人标准版', '原文标讯 100 条（计额度），可查业主历史中标记录，筛单心里有底。', 999, 'CNY', 365, 100, 0, 'subscription', 20, 1, 2),
        ('personal_pro_1299', '个人专业版', '标讯不限量，AI 适配评分直接判断这单值不值得投，含中文解析报告与行业精准推送。', 1299, 'CNY', 365, 99999, 0, 'subscription', 30, 1, 3),
        ('enterprise_8800', '企业年度会员', '专业版全部 AI 权益（企业画像版评分、历史中标），标讯不限量，企业画像智能匹配，可参与联合体投标。', 8800, 'CNY', 365, 99999, 0, 'subscription', 40, 1, 4)
    `);

    console.log("[migration-090] 套餐体系已切换至 V2：旧权益全量作废（订阅/权益 closed、套餐行删除），新 4 档上架");
  },
};
