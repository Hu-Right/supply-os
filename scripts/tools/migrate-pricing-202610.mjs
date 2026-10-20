/**
 * 云境OS 个人/企业会员收费体系升级（2026-10 渠道版）—— 目录数据迁移
 *
 * @module scripts/tools/migrate-pricing-202610
 * @description 依据 docs/云境OS国际公采API授权及产品收费表渠道版(1).docx「一 个人与企业会员产品」
 *              调整运行库四张目录表：crm_plan_catalog / crm_benefit_catalog /
 *              crm_plan_benefits / crm_service_catalog。仅动个人/企业这条线，机构 API、
 *              渠道佣金、单项专业服务、成功费一律不碰。
 *
 *              安全口径：
 *              - 全程单事务；默认 dry-run（执行后 ROLLBACK，仅打印将发生的改动与影响行数），
 *                加 --apply 才 COMMIT 落库。
 *              - 幂等：档位/权益/矩阵/服务一律 INSERT ... ON DUPLICATE KEY UPDATE，可重复跑。
 *              - 原地改价的前提：pro/starter/business 经核实活跃订阅为 0（仅 internal_demo 有订阅），
 *                无历史成交价需要保护，故原地改名/改价安全（详见提交说明）。
 *
 * 用法：
 *   node scripts/tools/migrate-pricing-202610.mjs          # dry-run（回滚，预览）
 *   node scripts/tools/migrate-pricing-202610.mjs --apply  # 真正落库
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");

const DB = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER || "root",
  password: (process.env.DB_PASSWORD || "").replace(/^['"]|['"]$/g, ""),
  database: process.env.DB_NAME || "crm",
  charset: "utf8mb4",
};

// ── 1) 个人/企业档位：改名 / 改价 / 下架 / 新增（原地改，0 存量为前提） ──────────
const PLAN_UPDATES = [
  { plan_code: "free", set: { name_zh: "免费会员" } },
  {
    plan_code: "starter",
    set: {
      name_zh: "商机体验",
      name_en: "TRIAL",
      price: "299.00",
      billing_period_days: 7,
      upgrade_credit_days: 30,
      positioning_zh: "有明确产品、准备验证机会的企业：7 天每日匹配 + 1 条 AI 深度拆解 + 30 分钟线上机会诊断；30 天内升级企业会员可全额抵扣。",
    },
  },
  { plan_code: "pro", set: { is_active: 0 } }, // 个人标准版 ¥999 下架退役（0 存量）
  {
    plan_code: "unlimited",
    set: {
      name_zh: "个人商机会员",
      positioning_zh: "个人外贸员、投标员、SOHO：订单检索、关键词订阅、截止提醒、原标讯入口及基础 AI 中文摘要（不含人工咨询）。",
    },
  },
  {
    plan_code: "business",
    set: {
      name_zh: "企业商机版",
      price: "16800.00",
      positioning_zh: "资质和材料达标 60 分以上、有真实投标计划的企业：企业产品画像、UNSPSC/CPV、每日智能匹配、订单 CRM、Bid/No-Bid 判断、资格与缺口识别、技术/商务要求矩阵。",
    },
  },
  {
    plan_code: "advisor",
    set: {
      name_zh: "企业咨询顾问",
      price: "49800.00",
      is_active: 1,
      badge: "best_value",
      positioning_zh: "有投标团队或多部门协同需求的企业：企业证据库、标书协同/版本/Deadline 管理、AI 审标与提交清单、每 2 月 1 次投标专家会诊（1 年 6 次）。",
    },
  },
];

// 战略客户版：新增 contact 档（最高企业档），权益取企业咨询顾问的现有格为基线，另加人工筛选/战略会议/专属 CSM。
const NEW_PLAN = {
  plan_code: "strategic",
  name_en: "STRATEGIC",
  name_zh: "战略客户版",
  positioning_zh: "集团、上市公司、工程及大型制造企业：重点订单（500 万美元以上）人工筛选、月度战略会议及专属客户成功经理。",
  price: "0.00",
  price_mode: "contact",
  currency: "CNY",
  billing_period_days: null,
  commercial_tier: "L5",
  cta_i18n_key: "cta_strategic",
  badge: "custom",
  sort_order: 6,
  is_active: 1,
  upgrade_credit_days: null,
};

// ── 2) 新增权益码（bool/quota；枚举行才需 level_dict，本批无需） ──────────────────
const NEW_BENEFITS = [
  { code: "bid_nobid", name: "Bid / No-Bid 判断", kind: "bool", sort: 160 },
  { code: "qualification_gap", name: "资格与缺口识别", kind: "bool", sort: 161 },
  { code: "requirement_matrix", name: "技术/商务要求矩阵", kind: "bool", sort: 162 },
  { code: "order_crm", name: "订单 CRM", kind: "bool", sort: 163 },
  { code: "evidence_library", name: "企业证据库", kind: "bool", sort: 164 },
  { code: "bid_collab", name: "标书协同 / 版本 / Deadline 管理", kind: "bool", sort: 165 },
  { code: "ai_bid_review", name: "AI 审标与提交清单", kind: "bool", sort: 166 },
  { code: "expert_consult", name: "投标专家会诊", kind: "quota", sort: 167 },
  { code: "manual_order_match", name: "重点订单人工筛选", kind: "bool", sort: 168 },
  { code: "strategy_meeting", name: "月度战略会议", kind: "bool", sort: 169 },
  { code: "dedicated_csm", name: "专属客户成功经理", kind: "bool", sort: 170 },
];
const NEW_BENEFIT_CODES = NEW_BENEFITS.map((b) => b.code);
const QUOTA_BENEFITS = new Set(NEW_BENEFITS.filter((b) => b.kind === "quota").map((b) => b.code));

// ── 3) 矩阵补格：新权益在各档的取值（默认 0；仅企业三档及以上给值） ────────────────
// 组 A：企业商机版及以上；组 B：企业咨询顾问及以上；组 C：仅战略客户版。
const TIER_HAS_A = new Set(["business", "advisor", "strategic"]);
const TIER_HAS_B = new Set(["advisor", "strategic"]);
const TIER_HAS_C = new Set(["strategic"]);

function newBenefitValue(planCode, benefitCode) {
  if (benefitCode === "expert_consult") {
    return TIER_HAS_B.has(planCode) ? 6 : 0; // 会诊次数/年；企业咨询顾问及以上=6，否则 0
  }
  const groupA = ["bid_nobid", "qualification_gap", "requirement_matrix", "order_crm"];
  const groupB = ["evidence_library", "bid_collab", "ai_bid_review"];
  if (groupA.includes(benefitCode)) return TIER_HAS_A.has(planCode) ? 1 : 0;
  if (groupB.includes(benefitCode)) return TIER_HAS_B.has(planCode) ? 1 : 0;
  if (["manual_order_match", "strategy_meeting", "dedicated_csm"].includes(benefitCode)) {
    return TIER_HAS_C.has(planCode) ? 1 : 0;
  }
  return 0;
}

// ── 4) 单标类服务：改名/改价 + 顾问服务去重 ──────────────────────────────────────
const SERVICE_UPDATES = [
  {
    service_code: "svc_manual_bid_match",
    set: {
      name_zh: "单标体验",
      name_en: "Single Notice Experience",
      standard_price: "500.00",
      deliverable_note_zh: "① OS 按企业画像自动匹配、企业同样感兴趣的标讯 ② 包含联系方式",
    },
  },
  {
    service_code: "svc_bid_companion",
    set: {
      name_zh: "单标陪跑",
      name_en: "Single Bid Companion",
      standard_price: "16800.00",
      price_from: 0,
      deliverable_note_zh: "① 帮助找到并筛选标讯 ② 标书、商务谈判、定价等后续提供专业咨询 ③ 直至投标结果出炉的全链路交付",
    },
  },
  // 企业咨询顾问已在档位（advisor）复活，同名服务下架去重，避免"同一商品两处上架"。
  { service_code: "svc_annual_advisor", set: { is_active: 0 } },
];

const cols = (o) => Object.keys(o);
const ph = (n) => Array(n).fill("?").join(",");

async function main() {
  const conn = await mysql.createConnection(DB);
  const summary = [];
  try {
    await conn.beginTransaction();

    // 现有全部档位码（用于给每档补新权益格）
    const [planRows] = await conn.query("SELECT plan_code FROM crm_plan_catalog");
    const allPlanCodes = planRows.map((r) => r.plan_code);
    if (!allPlanCodes.includes("strategic")) allPlanCodes.push("strategic");

    // 1) 档位改名/改价/下架
    for (const { plan_code, set } of PLAN_UPDATES) {
      const keys = cols(set);
      const [res] = await conn.query(
        `UPDATE crm_plan_catalog SET ${keys.map((k) => `${k}=?`).join(",")} WHERE plan_code=?`,
        [...keys.map((k) => set[k]), plan_code],
      );
      summary.push(`[plan] ${plan_code} → ${keys.join(",")} (影响 ${res.affectedRows})`);
    }

    // 2) 新增战略客户版（幂等）
    {
      const keys = cols(NEW_PLAN);
      const updates = keys.filter((k) => k !== "plan_code").map((k) => `${k}=VALUES(${k})`);
      await conn.query(
        `INSERT INTO crm_plan_catalog (${keys.join(",")}) VALUES (${ph(keys.length)})
         ON DUPLICATE KEY UPDATE ${updates.join(",")}`,
        keys.map((k) => NEW_PLAN[k]),
      );
      summary.push(`[plan] INSERT/UPSERT ${NEW_PLAN.plan_code}`);
    }

    // 3) 战略客户版现有权益格 = 复制 advisor 基线（只复制非本批新增的格，避免与第 5 步重复）
    await conn.query(
      `INSERT INTO crm_plan_benefits (plan_code, benefit_code, value_level, value_num, value_amount, note_zh)
       SELECT 'strategic', benefit_code, value_level, value_num, value_amount, note_zh
         FROM crm_plan_benefits
        WHERE plan_code='advisor' AND benefit_code NOT IN (${ph(NEW_BENEFIT_CODES.length)})
       ON DUPLICATE KEY UPDATE value_level=VALUES(value_level), value_num=VALUES(value_num), value_amount=VALUES(value_amount), note_zh=VALUES(note_zh)`,
      NEW_BENEFIT_CODES,
    );
    summary.push(`[matrix] strategic 复制 advisor 现有格`);

    // 4) 新增权益码
    for (const b of NEW_BENEFITS) {
      await conn.query(
        `INSERT INTO crm_benefit_catalog (benefit_code, name_zh, value_kind, level_dict, sort_order)
         VALUES (?,?,?,?,?)
         ON DUPLICATE KEY UPDATE name_zh=VALUES(name_zh), value_kind=VALUES(value_kind), sort_order=VALUES(sort_order)`,
        [b.code, b.name, b.kind, null, b.sort],
      );
    }
    summary.push(`[benefit] UPSERT ${NEW_BENEFITS.length} 个新权益码`);

    // 5) 为每一档补齐新权益格（默认 0，企业三档按组给值）
    let cellCount = 0;
    for (const planCode of allPlanCodes) {
      for (const b of NEW_BENEFITS) {
        const v = newBenefitValue(planCode, b.code);
        const isQuota = QUOTA_BENEFITS.has(b.code);
        const valueLevel = isQuota ? null : v;
        const valueNum = isQuota ? v : null;
        await conn.query(
          `INSERT INTO crm_plan_benefits (plan_code, benefit_code, value_level, value_num)
           VALUES (?,?,?,?)
           ON DUPLICATE KEY UPDATE value_level=VALUES(value_level), value_num=VALUES(value_num)`,
          [planCode, b.code, valueLevel, valueNum],
        );
        cellCount++;
      }
    }
    summary.push(`[matrix] 补齐新权益格 ${cellCount} 格（${allPlanCodes.length} 档 × ${NEW_BENEFITS.length} 权益）`);

    // 6) 服务改名/改价/去重
    for (const { service_code, set } of SERVICE_UPDATES) {
      const keys = cols(set);
      const [res] = await conn.query(
        `UPDATE crm_service_catalog SET ${keys.map((k) => `${k}=?`).join(",")} WHERE service_code=?`,
        [...keys.map((k) => set[k]), service_code],
      );
      summary.push(`[service] ${service_code} → ${keys.join(",")} (影响 ${res.affectedRows})`);
    }

    // ── 打印落库后的现场核查 ──
    console.log(`\n===== 迁移操作（${APPLY ? "APPLY · 将 COMMIT" : "DRY-RUN · 将 ROLLBACK"}）=====`);
    for (const s of summary) console.log("  " + s);

    console.log("\n===== 变更后档位 =====");
    const [plans] = await conn.query(
      `SELECT plan_code, name_zh, price, price_mode, billing_period_days, commercial_tier, badge, sort_order, is_active, upgrade_credit_days
         FROM crm_plan_catalog ORDER BY sort_order`,
    );
    console.table(plans);

    // 缺格自检：在售/免费档对每个权益必须有一格，缺则官网显示 ∅
    console.log("\n===== 缺格自检（应为 0 行）=====");
    const [gaps] = await conn.query(
      `SELECT p.plan_code, b.benefit_code
         FROM crm_plan_catalog p CROSS JOIN crm_benefit_catalog b
         LEFT JOIN crm_plan_benefits pb ON pb.plan_code=p.plan_code AND pb.benefit_code=b.benefit_code
        WHERE pb.id IS NULL AND (p.is_active=1 OR p.plan_code='free')
        ORDER BY p.sort_order, b.sort_order`,
    );
    if (gaps.length === 0) console.log("  ✓ 无缺格");
    else console.table(gaps);

    if (APPLY) {
      await conn.commit();
      console.log("\n✅ 已 COMMIT 落库。");
    } else {
      await conn.rollback();
      console.log("\n↩︎ DRY-RUN 已 ROLLBACK，未改动任何数据。加 --apply 落库。");
    }
  } catch (err) {
    await conn.rollback();
    console.error("❌ 迁移失败，已回滚：", err.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
