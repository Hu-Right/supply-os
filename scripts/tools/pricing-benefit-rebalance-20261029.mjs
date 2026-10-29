/**
 * 会员权益重新分配（2026-10-29）：把「附赠权益」在 个人 / 企业 / 人工对接 三档之间阶梯分配，
 * 并删掉三个没有实际功能的额度类权益。
 *
 * 背景：2026-10-28 定价矩阵把 10 项企业级工具（企业画像/关键词库/联合投标/Bid-NoBid/
 * 资格缺口/技术矩阵/订单CRM/证据库/标书协同/AI审标）留成全档 0（仅 internal 开满），
 * 结果连人工对接档也"用不全"；本次按阶梯原则分配：
 *   · 企业档（L3）：企业画像、产品关键词库、联合投标匹配、Bid/No-Bid、资格与缺口、技术/商务矩阵
 *   · 人工对接档（L4）：企业档全部 + 订单 CRM、企业证据库、标书协同、AI 审标（人工档 = 全集）
 *   · 个人档（L1）/免费档：不变（保持 0）
 * 这 10 项功能尚未上线，前端用「即将上线」标记（view 层 COMING_SOON_BENEFITS），不在这里落库。
 *
 * 另：expert_consult（投标专家会诊）、tech_support（技术支持）、industry_addon（行业加购包预留位）
 * 三个额度类权益当前没有任何功能实现/消费方，按要求从目录与矩阵中删除。
 *
 * 安全口径：
 *   - 默认 dry-run（事务内执行后 ROLLBACK，只打印将发生的改动）；
 *   - --apply 才 COMMIT；
 *   - 幂等：重复跑结果一致。
 *
 * 用法：
 *   node scripts/tools/pricing-benefit-rebalance-20261029.mjs          # 预览
 *   node scripts/tools/pricing-benefit-rebalance-20261029.mjs --apply  # 落库
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

/** 需要从目录/矩阵删除的额度类权益（无功能实现、无消费方） */
const DELETE_BENEFITS = ["expert_consult", "tech_support", "industry_addon"];

/** 阶梯分配：benefit_code -> { 企业档 level, 人工档 level }；档位行按 commercial_tier 取 */
const ASSIGN = {
  enterprise_profile: { business: 1, concierge: 2 }, // 企业=✓，人工=可配置
  product_keyword_lib: { business: 1, concierge: 2 },
  joint_bid_match: { business: 1, concierge: 2 }, // 企业=可申请，人工=优先匹配
  bid_nobid: { business: 1, concierge: 1 },
  qualification_gap: { business: 1, concierge: 1 },
  requirement_matrix: { business: 1, concierge: 1 },
  order_crm: { business: 0, concierge: 1 },
  evidence_library: { business: 0, concierge: 1 },
  bid_collab: { business: 0, concierge: 1 },
  ai_bid_review: { business: 0, concierge: 1 },
};

const TIER_PREFIX = { business: "business_", concierge: "concierge_" };

async function main() {
  const conn = await mysql.createConnection(DB);
  const summary = [];
  try {
    await conn.beginTransaction();

    // ── 1) 删除无功能实现的额度类权益（先删格再删目录，避开外键）──
    for (const code of DELETE_BENEFITS) {
      const [b] = await conn.query("SELECT benefit_code FROM benefit_catalog WHERE benefit_code = ?", [code]);
      if (b.length === 0) continue; // 幂等：已删过
      const [cells] = await conn.query("DELETE FROM plan_benefits WHERE benefit_code = ?", [code]);
      const [cat] = await conn.query("DELETE FROM benefit_catalog WHERE benefit_code = ?", [code]);
      summary.push(`[删除权益] ${code}：矩阵格 ${cells.affectedRows} 行、目录 ${cat.affectedRows} 行`);
    }

    // ── 2) 阶梯分配：按 commercial_tier 找到对应档位的全部周期行 ──
    for (const [code, perTier] of Object.entries(ASSIGN)) {
      const [defs] = await conn.query("SELECT value_kind FROM benefit_catalog WHERE benefit_code = ?", [code]);
      if (defs.length === 0) {
        summary.push(`[跳过] ${code}：目录不存在`);
        continue;
      }
      const kind = defs[0].value_kind;
      for (const [tierKey, level] of Object.entries(perTier)) {
        const prefix = TIER_PREFIX[tierKey];
        const [plans] = await conn.query(
          "SELECT plan_code FROM plan_catalog WHERE plan_code LIKE ? ORDER BY plan_code",
          [`${prefix}%`],
        );
        for (const { plan_code: planCode } of plans) {
          const [before] = await conn.query(
            "SELECT value_level, value_num FROM plan_benefits WHERE plan_code = ? AND benefit_code = ?",
            [planCode, code],
          );
          const cur = before[0];
          const already = kind === "quota"
            ? Number(cur?.value_num) === level
            : Number(cur?.value_level) === level;
          if (already) continue; // 幂等：已是目标值就不动、不刷明细
          if (kind === "quota") {
            await conn.query(
              "UPDATE plan_benefits SET value_num = ?, value_level = NULL WHERE plan_code = ? AND benefit_code = ?",
              [level, planCode, code],
            );
          } else {
            await conn.query(
              "UPDATE plan_benefits SET value_level = ?, value_num = NULL WHERE plan_code = ? AND benefit_code = ?",
              [level, planCode, code],
            );
          }
          summary.push(
            `[分配] ${code} / ${planCode}：${JSON.stringify(cur ?? null)} → ${kind === "quota" ? `num=${level}` : `level=${level}`}`,
          );
        }
      }
    }

    // ── 3) 个人档/免费档保持 0（只报告，不改；internal_demo 开满是设计口径，不算异常）──
    for (const code of Object.keys(ASSIGN)) {
      const [rows] = await conn.query(
        `SELECT plan_code, value_level FROM plan_benefits
          WHERE benefit_code = ? AND (plan_code LIKE 'personal_%' OR plan_code = 'free')
          ORDER BY plan_code`,
        [code],
      );
      const nonZero = rows.filter((r) => Number(r.value_level) > 0);
      if (nonZero.length > 0) summary.push(`[注意] ${code} 非企业/人工档存在非零值：${JSON.stringify(nonZero)}`);
    }

    // ── 4) 校验：10 项权益在企业/人工档必须为「有值」，且人工档覆盖企业档 ──
    for (const [code, perTier] of Object.entries(ASSIGN)) {
      for (const [tierKey, level] of Object.entries(perTier)) {
        if (level <= 0) continue;
        const prefix = TIER_PREFIX[tierKey];
        const [rows] = await conn.query(
          `SELECT COUNT(*) n FROM plan_benefits
            WHERE benefit_code = ? AND plan_code LIKE ? AND (value_level > 0 OR value_num > 0)`,
          [code, `${prefix}%`],
        );
        if (Number(rows[0].n) !== 3) summary.push(`[✗校验] ${code}/${tierKey} 应有 3 个周期行有值，实得 ${rows[0].n}`);
      }
    }

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
