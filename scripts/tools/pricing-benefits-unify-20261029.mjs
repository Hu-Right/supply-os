/**
 * 权益大一统 + AI 限次下线（2026-10-29 第三轮）
 *
 * 用户拍板：
 *   1) 删掉「AI 摘要与智能匹配每月 30 次」——个人档改为不限（-1），文案去掉次数；
 *      计量代码保留（将来若要恢复限次只改矩阵一格，零代码）。
 *   2) 把详情页功能入口收进「套餐权益」同一套矩阵：
 *      新增 qualification_access（资格条件查看）、original_file_access（原始文件下载），
 *      详情页 Tab 与定价页都由同一份 plan_benefits 驱动；付费档=已含，免费档=升级。
 *
 * 安全：默认 dry-run，--apply 才提交；幂等可重复跑。
 * 用法：
 *   node scripts/tools/pricing-benefits-unify-20261029.mjs
 *   node scripts/tools/pricing-benefits-unify-20261029.mjs --apply
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

/** 新增权益（详情页原有入口，正式纳入矩阵） */
const NEW_BENEFITS = [
  { code: "qualification_access", name: "资格条件查看", sort: 35 },
  { code: "original_file_access", name: "原始文件下载", sort: 36 },
];

/** 新增权益在各档的取值：付费档（个人/企业/人工）与内部演示=1，免费档=0 */
const NEW_BENEFIT_TIERS = {
  free: 0,
  personal_: 1,
  business_: 1,
  concierge_: 1,
  internal_demo: 1,
};

/** 个人档 AI 计量改为不限（-1），不再出现「每月 30 次」 */
const UNLIMITED_QUOTAS = ["ai_summary_quota", "ai_match_quota"];

/** 个人档卡头文案：去掉「每月30次」 */
const PERSONAL_POSITIONING =
  "个人外贸员/投标员：锁定1个行业看全量标讯详情（含联系方式），AI 摘要与智能匹配不限次（自备模型 Key）。";

async function main() {
  const conn = await mysql.createConnection(DB);
  const summary = [];
  try {
    await conn.beginTransaction();

    const [planRows] = await conn.query("SELECT plan_code FROM plan_catalog ORDER BY sort_order");
    const plans = planRows.map((r) => r.plan_code);

    // ── 1) 新增详情页入口权益（upsert + 全档补格）──
    for (const b of NEW_BENEFITS) {
      await conn.query(
        `INSERT INTO benefit_catalog (benefit_code, name_zh, value_kind, level_dict, sort_order)
         VALUES (?, ?, 'bool', NULL, ?)
         ON DUPLICATE KEY UPDATE name_zh = VALUES(name_zh), value_kind = 'bool', level_dict = NULL, sort_order = VALUES(sort_order)`,
        [b.code, b.name, b.sort],
      );
      summary.push(`[新增] ${b.code} = ${b.name}（sort ${b.sort}）`);

      for (const plan of plans) {
        const [rows] = await conn.query(
          "SELECT value_level FROM plan_benefits WHERE plan_code = ? AND benefit_code = ?",
          [plan, b.code],
        );
        const level = Object.entries(NEW_BENEFIT_TIERS).find(([k]) =>
          k.endsWith("_") ? plan.startsWith(k) : plan === k,
        )?.[1] ?? 0;
        if (rows.length === 0) {
          await conn.query(
            "INSERT INTO plan_benefits (plan_code, benefit_code, value_level, value_num, value_amount, note_zh) VALUES (?, ?, ?, NULL, NULL, NULL)",
            [plan, b.code, level],
          );
          summary.push(`[补格] ${b.code}/${plan} = ${level}`);
        } else if (Number(rows[0].value_level) !== level) {
          await conn.query(
            "UPDATE plan_benefits SET value_level = ? WHERE plan_code = ? AND benefit_code = ?",
            [level, plan, b.code],
          );
          summary.push(`[取值] ${b.code}/${plan}：${rows[0].value_level} → ${level}`);
        }
      }
    }

    // ── 2) AI 计量：个人档改为不限（-1）──
    for (const code of UNLIMITED_QUOTAS) {
      const [res] = await conn.query(
        "UPDATE plan_benefits SET value_num = -1 WHERE benefit_code = ? AND plan_code LIKE 'personal_%' AND (value_num IS NULL OR value_num <> -1)",
        [code],
      );
      summary.push(`[额度] ${code} 个人档 → -1（不限），影响 ${res.affectedRows} 格`);
    }

    // ── 3) 个人档卡头文案去限次 ──
    const [res] = await conn.query(
      "UPDATE plan_catalog SET positioning_zh = ? WHERE plan_code = 'personal_m' AND positioning_zh <> ?",
      [PERSONAL_POSITIONING, PERSONAL_POSITIONING],
    );
    if (res.affectedRows > 0) summary.push("[文案] personal_m positioning_zh 已去掉「每月30次」");

    // ── 3b) 命名统一：定价页与详情页都叫「AI 智能匹配」（原详情页叫 AI 适配评估，编码保持不变）──
    const [renamed] = await conn.query(
      "UPDATE benefit_catalog SET name_zh = 'AI 智能匹配' WHERE benefit_code = 'ai_match' AND name_zh <> 'AI 智能匹配'",
    );
    if (renamed.affectedRows > 0) summary.push("[命名] ai_match → AI 智能匹配（与详情页 Tab 同文案）");

    // ── 4) 校验矩阵完整 ──
    const [defCount] = await conn.query("SELECT COUNT(*) n FROM benefit_catalog");
    const [cellCount] = await conn.query("SELECT COUNT(*) n FROM plan_benefits");
    const expected = plans.length * Number(defCount[0].n);
    summary.push(
      Number(cellCount[0].n) === expected
        ? `[✓校验] 矩阵完整：${plans.length} 档 × ${defCount[0].n} 权益 = ${expected} 格`
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
