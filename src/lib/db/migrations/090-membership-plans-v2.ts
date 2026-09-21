/**
 * 090: 会员套餐体系切换 V2（对齐《云境产品服务权益报价表_260921_V2》）
 * membership-plans-v2
 *
 * 背景（2026-09-21 产品决策）：
 * - 线上权益按新报价表切换为 5 档：免费注册(rank0) → 个人体验版129(rank1) →
 *   个人标准版999(rank2, +历史中标) → 个人专业版1299(rank3, +AI适配评分) → 企业年度会员8800(rank4)。
 * - 旧套餐一律下架；**无任何订阅/权益/订单引用的旧套餐物理删除**（用户裁决："没人用的一律删掉"），
 *   仍被引用的保留行（is_active=0）——物理删除被引用行会导致 pending 订单履约静默失败
 *   （activatePaidOrder 查不到套餐跳过发放）、历史权益失去名称/价格来源。
 * - 新增 benefit_rank 档位列作为功能门控单一事实源（award-history≥2、ai-score≥3 等），
 *   存量旧套餐按映射赋 rank 到期自然过渡：
 *   8800系+5600系+人工授予 → rank4；799 → rank2；周卡/trial/'s' → rank1；单次卡 → rank0（仅剩额度）。
 * - 悬挂 code 补插下架行：trial_99_3/trial_3/'s'/manual_full_unlock 在部分库中套餐行已被删
 *   但订阅/权益仍引用（本地库审计实测），不补行会让 findCurrentBestPlan JOIN 失败、
 *   rank 解析为 0，存量用户掉档。
 *
 * 幂等性：rank UPDATE / free 行 UPDATE / DELETE 带引用守卫均可重复执行；
 * 新套餐与悬挂行 INSERT IGNORE（plan_code UNIQUE）。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

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

    // 2. 悬挂 code 补插下架行（存量订阅/权益仍引用但套餐行已缺失的历史 code）
    await dbPool.execute(`
      INSERT IGNORE INTO crm_membership_plans
        (plan_code, name, description, price, currency, duration_days, unlock_quota, free_quota, plan_type, sort_order, is_active, benefit_rank)
      VALUES
        ('trial_99_3', '历史试用卡（已停售）', '历史套餐存量兼容行，不可购买。', 99, 'CNY', NULL, 3, 0, 'subscription', 900, 0, 1),
        ('trial_3', '历史试用卡（已停售）', '历史套餐存量兼容行，不可购买。', 99, 'CNY', 3, 3, 0, 'subscription', 901, 0, 1),
        ('s', '历史套餐（已停售）', '历史套餐存量兼容行，不可购买。', 299, 'CNY', 365, 365, 0, 'subscription', 902, 0, 1),
        ('manual_full_unlock', '人工全额解锁（历史授予）', '人工授予的存量权益兼容行，不可购买。', 8800, 'CNY', NULL, 999999, 0, 'subscription', 903, 0, 4)
    `);

    // 3. 旧套餐统一下架 + 按映射赋 rank（存量用户到期前按 rank 享受新权益，续费走新套餐）
    await dbPool.execute(`
      UPDATE crm_membership_plans
      SET is_active = 0,
          benefit_rank = CASE
            WHEN plan_code IN ('annual_8800','annual_16800','annual_26800','annual_8','annual_5600','annual_manual_8800','manual_full_unlock') THEN 4
            WHEN plan_code = 'annual_799' THEN 2
            WHEN plan_code IN ('week_299_21','trial_99_3','trial_3','s') THEN 1
            ELSE 0
          END
      WHERE plan_type <> 'free'
        AND plan_code NOT IN ('personal_trial_129','personal_std_999','personal_pro_1299','enterprise_8800')
    `);

    // 4. 无引用的旧套餐物理删除（有订阅/权益/订单任一引用则保留，仅下架）
    await dbPool.execute(`
      DELETE p FROM crm_membership_plans p
      WHERE p.plan_code IN (
        'single_99','single_199','single_89','week_299_21',
        'annual_5600','annual_799','annual_8800','annual_16800','annual_26800','annual_8','annual_manual_8800'
      )
        AND NOT EXISTS (SELECT 1 FROM crm_user_subscriptions s WHERE s.plan_code = p.plan_code)
        AND NOT EXISTS (SELECT 1 FROM crm_user_entitlements e WHERE e.plan_code = p.plan_code)
        AND NOT EXISTS (SELECT 1 FROM crm_payment_orders o WHERE o.plan_code = p.plan_code)
    `);

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

    console.log("[migration-090] 套餐体系已切换至 V2（旧套餐下架/清理，新 4 档上架，benefit_rank 门控生效）");
  },
};
