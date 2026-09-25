/**
 * 097: 会员套餐调整 · 中文能力按档位门控 + 企业版收敛（数据迁移，幂等）
 * plans-chinese-gating
 *
 * @description 对齐 2026-09 白板定价与两项产品调整，全部落在权益体系新表组（crm_plan_catalog /
 *              crm_benefit_catalog / crm_plan_benefits / crm_service_catalog）：
 *
 *              1) 新增权益 notice_translation（bool）：作为「中文能力」的单一事实源开关。
 *                 取值——free/starter/pro = 0（无中文），unlimited/business/advisor/enterprise = 1。
 *                 驱动 /translation、/content 的 description_cn 与前端「查看译文」按档位收紧。
 *
 *              2) 个人低档收紧：starter/pro 的 ai_summary 由 2(完整)→0（不享有），
 *                 pro 的 ai_match 由 1(基础)→0。使 129/999 解锁后「只看原文」：
 *                 无 AI 摘要、无 AI 适配评分、无中文翻译。free 档维持现状（脱敏摘要 teaser 不动）。
 *                 1299(unlimited) 及以上：原文 + 中文报告（翻译 + AI 摘要 + AI 评分）全套。
 *
 *              3) 企业版收敛为「199 + 8800」两档：
 *                 - advisor(36800)、enterprise(机构/API) 置 is_active=0 下架销售（不删行，
 *                   门控按订阅 plan_code 读矩阵，老订阅到期前权益不受影响）；
 *                 - 新增服务 SKU svc_manual_bid_match「1:1 人工找单」¥199（crm_service_catalog，
 *                   非订阅），由前端在企业 Tab 与 8800 并列渲染。
 *
 *              幂等：目录用 INSERT ... ON DUPLICATE KEY UPDATE，格子用 INSERT ... ON DUPLICATE
 *              KEY UPDATE，档位下架与旧格收紧用 UPDATE。可安全重跑。
 *
 *              ⚠️ 连带维护：本迁移改变 crm_benefit_catalog / crm_plan_benefits / crm_service_catalog
 *              绝对数量，必须同步 scripts/verify-benefit-constraints.ts 的 EXPECTED_STATIC
 *              （benefits 20→21、cells 140→147、services 15→16），否则矩阵闭合门禁 CI 红。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";
import { NOTICE_TRANSLATION_BENEFIT } from "@/lib/services/benefit-matrix";

/** notice_translation 各档取值（bool：0=无中文 / 1=有中文），覆盖全部 7 档保证矩阵闭合。 */
const TRANSLATION_CELLS: Array<[string, number]> = [
  ["free", 0],
  ["starter", 0],
  ["pro", 0],
  ["unlimited", 1],
  ["business", 1],
  ["advisor", 1],
  ["enterprise", 1],
];

/** 低档收紧：把指定 (套餐, 权益) 格强制为 0（enum 层级 0 = 不享有）。 */
const DOWNGRADE_CELLS: Array<[string, string]> = [
  ["starter", "ai_summary"],
  ["pro", "ai_summary"],
  ["pro", "ai_match"],
];

export const migration: Migration = {
  version: 97,
  name: "plans-chinese-gating",
  async up(dbPool: Pool) {
    // 1) 新增 notice_translation 权益定义（bool，归属 notice 组，需订阅才可能享有）
    await dbPool.execute(
      `INSERT INTO crm_benefit_catalog
         (benefit_code, name_zh, group_code, value_kind, level_dict, is_consumable, requires_subscription, gate_key, sort_order, is_active)
       VALUES (?, '公告译文（多语言翻译）', 'notice', 'bool', NULL, 0, 1, ?, 15, 1)
       ON DUPLICATE KEY UPDATE
         name_zh = VALUES(name_zh), group_code = VALUES(group_code), value_kind = VALUES(value_kind),
         is_consumable = VALUES(is_consumable), requires_subscription = VALUES(requires_subscription),
         gate_key = VALUES(gate_key), sort_order = VALUES(sort_order), is_active = 1`,
      [NOTICE_TRANSLATION_BENEFIT, NOTICE_TRANSLATION_BENEFIT],
    );

    // 2) notice_translation 逐档格子（bool 只填 value_level，满足 chk_one_value）
    for (const [planCode, level] of TRANSLATION_CELLS) {
      await dbPool.execute(
        `INSERT INTO crm_plan_benefits (plan_code, benefit_code, value_level)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE value_level = VALUES(value_level), value_num = NULL, value_amount = NULL`,
        [planCode, NOTICE_TRANSLATION_BENEFIT, level],
      );
    }

    // 3) 低档收紧：ai_summary / ai_match 强制为层级 0（不享有）
    for (const [planCode, benefitCode] of DOWNGRADE_CELLS) {
      await dbPool.execute(
        `UPDATE crm_plan_benefits SET value_level = 0, value_num = NULL, value_amount = NULL
          WHERE plan_code = ? AND benefit_code = ?`,
        [planCode, benefitCode],
      );
    }

    // 4) 新增企业「1:1 人工找单」服务 SKU（¥199，自助下单，交付为人工撮合）
    await dbPool.execute(
      `INSERT INTO crm_service_catalog
         (service_code, category, name_zh, name_en, price_mode, standard_price, price_from, currency,
          grant_benefit_code, grant_quota, grant_period, sale_mode, member_discount, deliverable_note_zh, is_active, sort_order)
       VALUES ('svc_manual_bid_match', 'pro_service', '1:1 人工找单', 'Manual Opportunity Matching', 'per_time', 199.00, 0, 'CNY',
          NULL, NULL, 'none', 'self', 'none', '下单后由顾问 1:1 对接，人工筛选并推送符合贵司能力的国际公共采购机会。', 1, 15)
       ON DUPLICATE KEY UPDATE
         category = VALUES(category), name_zh = VALUES(name_zh), name_en = VALUES(name_en),
         price_mode = VALUES(price_mode), standard_price = VALUES(standard_price), price_from = VALUES(price_from),
         sale_mode = VALUES(sale_mode), member_discount = VALUES(member_discount),
         deliverable_note_zh = VALUES(deliverable_note_zh), is_active = 1, sort_order = VALUES(sort_order)`,
    );

    // 5) 企业版收敛：advisor / enterprise 下架销售（保留行与老订阅权益）
    await dbPool.execute(
      `UPDATE crm_plan_catalog SET is_active = 0 WHERE plan_code IN ('advisor', 'enterprise')`,
    );

    console.log(
      "[migration-097] 中文能力权益 notice_translation 已建、starter/pro AI 权益已收紧、企业 199 服务已上架、advisor/enterprise 已下架（记得同步 verify-benefit-constraints 绝对值）",
    );
  },
};
