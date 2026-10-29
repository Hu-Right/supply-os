/**
 * 详情页按会员等级差异化（2026-10-29 第四轮）
 *
 * 用户拍板的两处差异化：
 *   1) 中文拆解报告收口到企业级：「投标可行性报告」(bid_feasibility_report) 权益门控
 *      （报告 route / preview route / FilesTab 均已改，无需改矩阵——企业/人工本来就是 1，个人是 0）。
 *   2) AI 智能匹配按档给层级：个人=基础(2)、企业=企业级(3)、人工=可定制(4)；
 *      level_dict 同步改成 {0:—,1:基础,2:基础,3:企业级,4:可定制}，
 *      定价页卡片会显示等级标签（不再只是 ✓）。
 *
 * 安全：默认 dry-run，--apply 才提交；幂等可重复跑。
 * 用法：
 *   node scripts/tools/pricing-tier-differentiation-20261029.mjs
 *   node scripts/tools/pricing-tier-differentiation-20261029.mjs --apply
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const DB = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER || "root",
  password: (process.env.DB_PASSWORD || "").replace(/^['"]|["']$/g, ""),
  database: process.env.DB_NAME || "crm",
  charset: "utf8mb4",
};

/** ai_match 层级字典：2=基础（个人/旧值统一显示为"基础"），3=企业级，4=可定制 */
const AI_MATCH_LEVEL_DICT = { 0: "—", 1: "基础", 2: "基础", 3: "企业级", 4: "可定制" };

/** 档位 → ai_match level */
const AI_MATCH_LEVELS = {
  personal_: 2,
  business_: 3,
  concierge_: 4,
  internal_demo: 4,
  free: 0,
};

async function main() {
  const conn = await mysql.createConnection(DB);
  const summary = [];
  try {
    await conn.beginTransaction();

    const [defs] = await conn.query("SELECT level_dict FROM benefit_catalog WHERE benefit_code = 'ai_match'");
    if (defs.length === 0) throw new Error("benefit_catalog 缺少 ai_match 行");

    // ── 1) 层级字典：改成业务可读的等级标签 ──
    const beforeDict = defs[0].level_dict;
    const before = typeof beforeDict === "string" ? JSON.parse(beforeDict) : beforeDict;
    if (JSON.stringify(before) !== JSON.stringify(AI_MATCH_LEVEL_DICT)) {
      await conn.query("UPDATE benefit_catalog SET level_dict = ? WHERE benefit_code = 'ai_match'", [
        JSON.stringify(AI_MATCH_LEVEL_DICT),
      ]);
      summary.push(`[字典] ai_match：${JSON.stringify(before)} → ${JSON.stringify(AI_MATCH_LEVEL_DICT)}`);
    }

    // ── 2) 三档给不同层级，让详情页/定价页能看出差异 ──
    for (const [prefix, level] of Object.entries(AI_MATCH_LEVELS)) {
      const isExact = !prefix.endsWith("_");
      const [plans] = await conn.query(
        isExact
          ? "SELECT plan_code FROM plan_catalog WHERE plan_code = ?"
          : "SELECT plan_code FROM plan_catalog WHERE plan_code LIKE ?",
        [isExact ? prefix : `${prefix}%`],
      );
      for (const { plan_code: plan } of plans) {
        const [rows] = await conn.query(
          "SELECT value_level FROM plan_benefits WHERE plan_code = ? AND benefit_code = 'ai_match'",
          [plan],
        );
        if (rows.length === 0) {
          await conn.query(
            "INSERT INTO plan_benefits (plan_code, benefit_code, value_level, value_num, value_amount, note_zh) VALUES (?, 'ai_match', ?, NULL, NULL, NULL)",
            [plan, level],
          );
          summary.push(`[补格] ai_match/${plan} = ${level}`);
        } else if (Number(rows[0].value_level) !== level) {
          await conn.query(
            "UPDATE plan_benefits SET value_level = ? WHERE plan_code = ? AND benefit_code = 'ai_match'",
            [level, plan],
          );
          summary.push(`[取值] ai_match/${plan}：${rows[0].value_level} → ${level}`);
        }
      }
    }

    // ── 3) 校验矩阵完整 ──
    const [planCount] = await conn.query("SELECT COUNT(*) n FROM plan_catalog");
    const [defCount] = await conn.query("SELECT COUNT(*) n FROM benefit_catalog");
    const [cellCount] = await conn.query("SELECT COUNT(*) n FROM plan_benefits");
    const expected = Number(planCount[0].n) * Number(defCount[0].n);
    summary.push(
      Number(cellCount[0].n) === expected
        ? `[✓校验] 矩阵完整：${planCount[0].n} 档 × ${defCount[0].n} 权益 = ${expected} 格`
        : `[✗校验] 矩阵格 ${cellCount[0].n} ≠ ${expected}`,
    );

    if (APPLY) {
      await conn.commit();
      console.log("✓ 已提交（COMMIT）");
    } else {
      await conn.rollback();
      console.log("（dry-run：已回滚，未写库；加 --apply 才落库）");
    }
    console.log(`\n改动明细（${summary.length} 条）：`);
    for (const s of summary) console.log("  " + s);
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error("✗ 失败：", e.message);
  process.exit(1);
});
