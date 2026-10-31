/**
 * 云境OS 定价对齐「云境国际采购平台产品报价表.xlsx」（2026-10-30 执行版）—— 目录数据迁移
 *
 * @module scripts/tools/pricing-align-quotation-20261031
 * @description 依据 docs/云境国际采购平台产品报价表.xlsx 对齐运行库三张表：
 *              1) service_catalog：按「服务项目报价」页改价/改名/新增 9 项服务；
 *              2) plan_benefits：个人档中文译文门控收紧（表格口径：个人会员不含中文解析报告）；
 *              3) plan_catalog：三档会员中文名对齐表格（企业基础会员 / 企业尊享会员）。
 *              「AI 写标书」报价表 0 元且后续可能收费——配套 DDL（service-catalog-free-price-ddl.mjs）
 *              已给 price_mode 加 'free' 形态并放宽 chk_price_by_mode 至 >=0，
 *              本脚本直接落 free + 0.00 真实价格；收费定稿后改回实价形态即可。
 *              「咨询·人工对接 199」为在售收入项，表格未列但保留不动，待商务裁决。
 *
 *              安全口径（同 migrate-pricing-202610）：
 *              - 全程单事务；默认 dry-run（执行后 ROLLBACK，仅打印将发生的改动），--apply 才 COMMIT。
 *              - 幂等：一律 INSERT ... ON DUPLICATE KEY UPDATE / 条件 UPDATE，可重复跑。
 *              - 落库前自动备份将被触碰的行到 runtime/backup-quotation-align-*.tsv。
 *
 * 用法：
 *   node scripts/tools/pricing-align-quotation-20261031.mjs          # dry-run（回滚，预览）
 *   node scripts/tools/pricing-align-quotation-20261031.mjs --apply  # 真正落库
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import path from "node:path";
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

// ── 1) 服务目录：对齐报价表「服务项目报价」页（快照式 UPSERT，可重复跑）
//    sort_order 按报价表序号 1..15；「咨询·人工对接 199」非表格项挤在序号 1 后（sort=1.5→2 位，编号 2），
//    后续项顺延。 ────────────────────────────────────────────────────────────────
const SERVICES = [
  { service_code: "svc_consult_ai", category: "pro_service", name_zh: "订单咨询（普通咨询）", name_en: "Order Consultation (Standard)", price_mode: "per_time", standard_price: "19.90", price_from: 0, sale_mode: "self", sort_order: 1, deliverable_note_zh: "订单信息、投标流程等常规问题的单次咨询答疑；最低单价项目，适合首次了解订单的客户" },
  { service_code: "svc_consult_human", category: "pro_service", name_zh: "咨询·人工对接", name_en: "Consultation (Human)", price_mode: "per_time", standard_price: "199.00", price_from: 0, sale_mode: "self", sort_order: 2, deliverable_note_zh: "人工对接的单次咨询（非报价表项，在售保留）" },
  { service_code: "svc_consult_compliance", category: "pro_service", name_zh: "订单咨询（材料资质合规咨询）", name_en: "Order Consultation (Compliance)", price_mode: "per_time", standard_price: "800.00", price_from: 0, sale_mode: "self", sort_order: 3, deliverable_note_zh: "针对企业资质与投标材料的合规性问题做单次专项咨询" },
  { service_code: "svc_material_review", category: "pro_service", name_zh: "材料审核", name_en: "Material Review", price_mode: "per_time", standard_price: "500.00", price_from: 0, sale_mode: "self", sort_order: 4, deliverable_note_zh: "对投标所需材料做单次完整性与规范性审核" },
  { service_code: "svc_material_prep_assist", category: "pro_service", name_zh: "辅助准备材料", name_en: "Material Preparation Assistance", price_mode: "per_time", standard_price: "2000.00", price_from: 0, sale_mode: "lead", sort_order: 5, deliverable_note_zh: "协助整理、翻译与归集投标所需的资质与商务材料" },
  { service_code: "svc_compliance_guidance", category: "pro_service", name_zh: "合规辅导", name_en: "Compliance Guidance", price_mode: "per_time", standard_price: "5800.00", price_from: 1, sale_mode: "lead", sort_order: 6, deliverable_note_zh: "围绕目标项目的合规要求提供专项辅导；面向重点项目，按项目复杂度核定" },
  { service_code: "svc_ai_bid_writing", category: "pro_service", name_zh: "AI 写标书", name_en: "AI Bid Document Drafting", price_mode: "free", standard_price: "0.00", price_from: 0, sale_mode: "lead", sort_order: 7, deliverable_note_zh: "基于平台模板与 AI 能力生成投标文件初稿，不含人工审核；现阶段免费（报价表 0 元），后续随项目发展可能收费，定价后改回实价形态" },
  { service_code: "svc_bid_doc_review_human", category: "pro_service", name_zh: "标书审核（人工普通审核）", name_en: "Bid Document Review (Standard)", price_mode: "per_time", standard_price: "800.00", price_from: 0, sale_mode: "self", sort_order: 8, deliverable_note_zh: "由标书团队对标书做人工审核并出具修改意见；普通国际投标师人工审核" },
  { service_code: "svc_bid_doc_review_expert", category: "pro_service", name_zh: "标书审核（专家审核）", name_en: "Bid Document Review (Expert)", price_mode: "per_time", standard_price: "3800.00", price_from: 0, sale_mode: "lead", sort_order: 9, deliverable_note_zh: "由行业专家对标书做深度审核，复核技术方案与评分点；专家资源有限，需提前预约" },
  { service_code: "svc_bid_manual", category: "pro_service", name_zh: "人工写标书", name_en: "Manual Bid Writing", price_mode: "per_time", standard_price: "5000.00", price_from: 1, sale_mode: "lead", sort_order: 10, deliverable_note_zh: "由标书团队按项目要求全流程编写投标文件；起价 5000 元，按标书体量与复杂度核定" },
  { service_code: "svc_bid_assist", category: "pro_service", name_zh: "辅助投标（咨询）", name_en: "Bidding Assistance (Consulting)", price_mode: "per_time", standard_price: "2000.00", price_from: 0, sale_mode: "lead", sort_order: 11, deliverable_note_zh: "投标环节的操作流程咨询与指导；提供投标全流程咨询服务" },
  { service_code: "svc_bid_proxy", category: "pro_service", name_zh: "代投标", name_en: "Bid Filing on Behalf", price_mode: "per_time", standard_price: "3800.00", price_from: 0, sale_mode: "lead", sort_order: 12, deliverable_note_zh: "代为完成投标报名、文件递交等投标环节操作；投前准备及文件、材料审核" },
  { service_code: "svc_negotiation_assist", category: "pro_service", name_zh: "辅助谈判", name_en: "Negotiation Assistance", price_mode: "per_time", standard_price: "3000.00", price_from: 0, sale_mode: "lead", sort_order: 13, deliverable_note_zh: "商务谈判策略准备与单次谈判过程支持" },
  { service_code: "svc_negotiation_proxy", category: "pro_service", name_zh: "代谈判", name_en: "Negotiation on Behalf", price_mode: "quote", standard_price: null, price_from: 0, sale_mode: "lead", sort_order: 14, deliverable_note_zh: "由平台代表企业参与商务谈判；按项目金额、谈判轮次与周期一对一报价" },
  { service_code: "svc_competitor_research", category: "pro_service", name_zh: "竞对调研", name_en: "Competitor Research", price_mode: "per_time", standard_price: "1800.00", price_from: 0, sale_mode: "lead", sort_order: 15, deliverable_note_zh: "针对目标项目的竞争对手情况调研并输出简报" },
  { service_code: "svc_quote_strategy", category: "pro_service", name_zh: "报价策略分析", name_en: "Quote Strategy Analysis", price_mode: "per_time", standard_price: "2200.00", price_from: 0, sale_mode: "lead", sort_order: 16, deliverable_note_zh: "结合项目与竞对情况，输出投标报价策略建议" },
];

// ── 2) 个人档中文译文门控收紧（bool 格 → 0） ────────────────────────────────────
const PERSONAL_PLANS = ["personal_m", "personal_q", "personal_y"];
const GATE_NOTE = "个人会员不含中文解析报告（公告译文）；依 2026-10-30 产品报价表口径收紧，仅企业基础会员及以上可见。";

// ── 3) 档位中文名对齐报价表（代表行改 name_zh，周期行同步前缀） ──────────────────
const TIER_RENAME = [
  { like: "personal_%", from: "个人会员", to: "个人会员" }, // 已一致，脚本内直接跳过
  { like: "business_%", from: "企业会员", to: "企业基础会员" },
  { like: "concierge_%", from: "人工对接", to: "企业尊享会员" },
];

const cols = (o) => Object.keys(o);
const ph = (n) => Array(n).fill("?").join(",");
const ts = () => new Date().toISOString().replace(/[-:TZ]/g, "").slice(0, 14);

async function main() {
  const conn = await mysql.createConnection(DB);
  const summary = [];
  try {
    await conn.beginTransaction();

    // ── 备份将被触碰的行（仅 --apply 时落盘，dry-run 不刷文件） ──
    const svcCodes = SERVICES.map((s) => s.service_code);
    const [bakSvcs] = await conn.query(
      `SELECT * FROM service_catalog WHERE service_code IN (${ph(svcCodes.length)})`, svcCodes,
    );
    const [bakGates] = await conn.query(
      `SELECT * FROM plan_benefits WHERE benefit_code = 'notice_translation' AND plan_code IN (${ph(PERSONAL_PLANS.length)})`,
      PERSONAL_PLANS,
    );
    const [bakPlans] = await conn.query(
      `SELECT * FROM plan_catalog WHERE plan_code LIKE 'business_%' OR plan_code LIKE 'concierge_%' OR plan_code LIKE 'personal_%'`,
    );
    let bakFile = null;
    if (APPLY) {
      bakFile = path.join("runtime", `backup-quotation-align-${ts()}.tsv`);
      const tsv = (label, rows) => [`# ${label}`, JSON.stringify(rows)].join("\t");
      writeFileSync(
        bakFile,
        [tsv("service_catalog(affected)", bakSvcs), tsv("plan_benefits(gate)", bakGates), tsv("plan_catalog(tiers)", bakPlans)].join("\n"),
        "utf8",
      );
    }
    summary.push(`${APPLY ? "[备份] " + bakFile : "[备份·预演]（dry-run 不落盘）"}（服务 ${bakSvcs.length} 行 / 门控格 ${bakGates.length} 行 / 档位 ${bakPlans.length} 行）`);

    // ── 1) 服务目录 UPSERT ──
    for (const s of SERVICES) {
      const keys = [...cols(s), "is_active"];
      const values = [...cols(s).map((k) => s[k]), 1];
      const updates = keys.filter((k) => k !== "service_code").map((k) => `${k}=VALUES(${k})`);
      const [existing] = await conn.query(`SELECT name_zh, standard_price, price_from FROM service_catalog WHERE service_code=?`, [s.service_code]);
      await conn.query(
        `INSERT INTO service_catalog (${keys.join(",")}, currency) VALUES (${ph(keys.length + 1)}) ON DUPLICATE KEY UPDATE ${updates.join(",")}, currency='CNY'`,
        [...values, "CNY"],
      );
      summary.push(existing.length
        ? `[service·改] ${s.service_code} ${existing[0].name_zh} ${existing[0].standard_price} → ${s.name_zh} ${s.standard_price}${s.price_from ? " 起" : ""}`
        : `[service·增] ${s.service_code} ${s.name_zh} ${s.standard_price}${s.price_from ? " 起" : ""}`);
    }

    // ── 2) 个人档译文门控收紧 ──
    for (const p of PERSONAL_PLANS) {
      const [res] = await conn.query(
        `INSERT INTO plan_benefits (plan_code, benefit_code, value_level, note_zh) VALUES (?, ?, 0, ?)
           ON DUPLICATE KEY UPDATE value_level = 0, value_num = NULL, value_amount = NULL, note_zh = VALUES(note_zh)`,
        [p, "notice_translation", GATE_NOTE],
      );
      summary.push(`[matrix] ${p}.notice_translation → 0（影响 ${res.affectedRows}）`);
    }

    // ── 3) 档位改名（仅动含旧前缀的行，幂等） ──
    for (const { like, from, to } of TIER_RENAME) {
      if (from === to) continue;
      const [res] = await conn.query(
        `UPDATE plan_catalog SET name_zh = REPLACE(name_zh, ?, ?) WHERE plan_code LIKE ? AND name_zh LIKE ?`,
        [from, to, like, `${from}%`],
      );
      summary.push(`[plan·名] ${like}: 「${from}」→「${to}」（影响 ${res.affectedRows}）`);
    }
    // 尊享档英文名按新定位换词（HUMAN→PREMIUM），仅改名不动其他字段
    await conn.query(`UPDATE plan_catalog SET name_en = 'PREMIUM' WHERE plan_code LIKE 'concierge_%' AND name_en = 'HUMAN'`);

    // ── 现场核查 ──
    console.log(`\n===== 迁移操作（${APPLY ? "APPLY · 将 COMMIT" : "DRY-RUN · 将 ROLLBACK"}）=====`);
    for (const s of summary) console.log("  " + s);

    console.log("\n===== 变更后服务目录（在售）=====");
    const [svcs] = await conn.query(
      `SELECT service_code, name_zh, price_mode, standard_price, price_from, sale_mode FROM service_catalog WHERE is_active=1 ORDER BY sort_order, service_code`,
    );
    console.table(svcs);

    console.log("\n===== 变更后会员档位 =====");
    const [plans] = await conn.query(
      `SELECT plan_code, name_zh, price, billing_period_days FROM plan_catalog WHERE is_active=1 ORDER BY sort_order`,
    );
    console.table(plans);

    console.log("\n===== 个人档译文格终态 =====");
    const [gates] = await conn.query(
      `SELECT plan_code, benefit_code, value_level, note_zh FROM plan_benefits WHERE benefit_code='notice_translation' AND plan_code LIKE 'personal%'`,
    );
    console.table(gates);

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
