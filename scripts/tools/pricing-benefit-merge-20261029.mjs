/**
 * 会员权益按「产品模块」收敛（2026-10-29 第二轮）
 *
 * 用户拍板（2026-10-29）：
 *   · 2/3/4（Bid-NoBid、资格缺口、技术/商务矩阵）= 一份「投标可行性报告」；
 *   · 6（企业证据库）与「企业能力画像」两个都要 → 合并为「企业资料库与能力画像」；
 *   · 7（标书协同/版本）不适合 → 删除，只留系统内置的截止提醒（不单列权益）；
 *   · 10（月度战略会议）不提供 → 删除，用按次人工咨询替代；
 *   · 9 + 11（重点订单人工筛选、专属客户成功经理）合并为「人工服务包」。
 *
 * 结果：软件侧 5 个模块 + 人工服务包 1 项（另保留原有基础权益/产品关键词库）。
 *   1) 投标可行性报告      bid_feasibility_report（新增）
 *   2) 企业资料库与能力画像 evidence_library（改名，并入 enterprise_profile）
 *   3) AI 审标与提交清单    ai_bid_review
 *   4) 履约台账            order_crm（改名）
 *   5) 联合体资源匹配       joint_bid_match（改名）
 *   6) 人工服务包          concierge_service（新增，并入 manual_order_match / dedicated_csm）
 *
 * 档位口径：企业档拿全部 5 个软件模块（联合体=可申请）；人工档 = 企业档 + 人工服务包 +
 * 联合体=优先匹配；个人档不变。
 *
 * 安全：默认 dry-run（事务内执行后 ROLLBACK）；--apply 才提交；幂等可重复跑。
 * 用法：
 *   node scripts/tools/pricing-benefit-merge-20261029.mjs
 *   node scripts/tools/pricing-benefit-merge-20261029.mjs --apply
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

/** 新增的模块权益（sort 复用被删行的空位，保持 130/168 两段清晰） */
const NEW_BENEFITS = [
  { code: "bid_feasibility_report", name: "投标可行性报告（投不投 / 资格缺口 / 逐条对照）", sort: 130 },
  { code: "concierge_service", name: "人工服务包（重点订单筛选 + 专属客户成功经理）", sort: 168 },
];

/** 并入其他模块/下线的旧权益：目录 + 矩阵格一并删除 */
const DELETE_BENEFITS = [
  "bid_nobid",              // → bid_feasibility_report
  "qualification_gap",      // → bid_feasibility_report
  "requirement_matrix",     // → bid_feasibility_report
  "enterprise_profile",     // → evidence_library（资料库 + 能力画像）
  "bid_collab",             // 不适合（标书协同/版本）
  "manual_order_match",     // → concierge_service
  "dedicated_csm",          // → concierge_service
  "strategy_meeting",       // 不提供（月度战略会议）
];

/** 名称改为业务语言（合并后一个模块一个说法） */
const RENAMES = {
  evidence_library: "企业资料库与能力画像（文件归档 + 自动画像）",
  order_crm: "履约台账（中标后订单跟踪）",
  joint_bid_match: "联合体资源匹配",
  ai_bid_review: "AI 审标与提交清单",
};

/** 矩阵取值：code -> { 档位前缀/精确码: level }
 * 企业档拿全部软件模块；人工档 = 企业档 + 人工服务包 + 联合体更高层级。
 */
const CELL_UPDATES = {
  // 新增模块（会给全部档位补齐格，这里列出非零档）
  bid_feasibility_report: { business_: 1, concierge_: 1, internal_demo: 1 },
  concierge_service: { concierge_: 1, internal_demo: 1 },
  // 既有模块：补企业档（原先是人工档独有/为空）
  evidence_library: { business_: 1 },
  order_crm: { business_: 1 },
  ai_bid_review: { business_: 1 },
  // 联合体：企业=可申请(1)，人工=优先匹配(2)（已是目标值则幂等跳过）
  joint_bid_match: { business_: 1, concierge_: 2 },
};

/** 档位卡头文案（positioning_zh）同步为模块化口径，避免还宣传已下线的"月度战略会议"等 */
const PLAN_POSITIONING = {
  business_m:
    "企业出海：1 个行业全量标讯 + 高级搜索、监控推送、AI 匹配与完整摘要不限次；含投标可行性报告、企业资料库与能力画像、AI 审标、履约台账、联合体匹配。",
  concierge_m:
    "1 对 1 人工对接：专属客户成功经理、重点订单人工筛选；软件能力全含（可行性报告 / 资料库与画像 / AI 审标 / 履约台账 / 联合体匹配）。",
};

async function main() {
  const conn = await mysql.createConnection(DB);
  const summary = [];
  try {
    await conn.beginTransaction();

    const [planRows] = await conn.query("SELECT plan_code FROM plan_catalog ORDER BY sort_order");
    const plans = planRows.map((r) => r.plan_code);
    summary.push(`[档位] ${plans.length} 个：${plans.join(", ")}`);

    // ── 1) 删除旧权益（先删格再删目录，避开外键）──
    for (const code of DELETE_BENEFITS) {
      const [defs] = await conn.query("SELECT benefit_code FROM benefit_catalog WHERE benefit_code = ?", [code]);
      if (defs.length === 0) continue;
      const [cells] = await conn.query("DELETE FROM plan_benefits WHERE benefit_code = ?", [code]);
      const [cat] = await conn.query("DELETE FROM benefit_catalog WHERE benefit_code = ?", [code]);
      summary.push(`[删除] ${code}：矩阵格 ${cells.affectedRows} 行、目录 ${cat.affectedRows} 行`);
    }

    // ── 2) 新增模块权益目录（upsert）──
    for (const b of NEW_BENEFITS) {
      await conn.query(
        `INSERT INTO benefit_catalog (benefit_code, name_zh, value_kind, level_dict, sort_order)
         VALUES (?, ?, 'bool', NULL, ?)
         ON DUPLICATE KEY UPDATE name_zh = VALUES(name_zh), value_kind = 'bool', level_dict = NULL, sort_order = VALUES(sort_order)`,
        [b.code, b.name, b.sort],
      );
      summary.push(`[新增] ${b.code} = ${b.name}（sort ${b.sort}）`);
    }

    // ── 3) 名称改为业务语言 ──
    for (const [code, name] of Object.entries(RENAMES)) {
      const [res] = await conn.query("UPDATE benefit_catalog SET name_zh = ? WHERE benefit_code = ?", [name, code]);
      if (res.affectedRows > 0) summary.push(`[改名] ${code} → ${name}`);
    }

    // ── 3b) 档位卡头文案同步为模块口径（下掉了"月度战略会议"等已下线承诺）──
    for (const [planCode, text] of Object.entries(PLAN_POSITIONING)) {
      const [res] = await conn.query("UPDATE plan_catalog SET positioning_zh = ? WHERE plan_code = ?", [text, planCode]);
      if (res.affectedRows > 0) summary.push(`[文案] ${planCode} positioning_zh 已更新`);
    }

    // ── 4) 新增模块：为全部档位补齐矩阵格（默认 0，再按口径给非零档）──
    for (const b of NEW_BENEFITS) {
      for (const plan of plans) {
        const [rows] = await conn.query(
          "SELECT value_level FROM plan_benefits WHERE plan_code = ? AND benefit_code = ?",
          [plan, b.code],
        );
        if (rows.length === 0) {
          await conn.query(
            "INSERT INTO plan_benefits (plan_code, benefit_code, value_level, value_num, value_amount, note_zh) VALUES (?, ?, 0, NULL, NULL, NULL)",
            [plan, b.code],
          );
        }
      }
      summary.push(`[补格] ${b.code}：覆盖 ${plans.length} 个档位`);
    }

    // ── 5) 写入各档取值（幂等：已是目标值跳过）──
    for (const [code, perTier] of Object.entries(CELL_UPDATES)) {
      for (const [tierKey, level] of Object.entries(perTier)) {
        const isExact = !tierKey.endsWith("_");
        const [targets] = await conn.query(
          isExact
            ? "SELECT plan_code FROM plan_catalog WHERE plan_code = ?"
            : "SELECT plan_code FROM plan_catalog WHERE plan_code LIKE ?",
          [isExact ? tierKey : `${tierKey}%`],
        );
        for (const { plan_code: plan } of targets) {
          const [rows] = await conn.query(
            "SELECT value_level FROM plan_benefits WHERE plan_code = ? AND benefit_code = ?",
            [plan, code],
          );
          if (rows.length > 0 && Number(rows[0].value_level) === level) continue;
          if (rows.length === 0) {
            await conn.query(
              "INSERT INTO plan_benefits (plan_code, benefit_code, value_level, value_num, value_amount, note_zh) VALUES (?, ?, ?, NULL, NULL, NULL)",
              [plan, code, level],
            );
          } else {
            await conn.query(
              "UPDATE plan_benefits SET value_level = ?, value_num = NULL WHERE plan_code = ? AND benefit_code = ?",
              [level, plan, code],
            );
          }
          summary.push(`[取值] ${code} / ${plan}：${rows[0]?.value_level ?? "缺格"} → ${level}`);
        }
      }
    }

    // ── 6) 校验：矩阵完整性（每档 × 每个目录权益都必须有且只有一格）──
    const [defCount] = await conn.query("SELECT COUNT(*) n FROM benefit_catalog");
    const [cellCount] = await conn.query("SELECT COUNT(*) n FROM plan_benefits");
    const expected = plans.length * Number(defCount[0].n);
    if (Number(cellCount[0].n) !== expected) {
      summary.push(`[✗校验] 矩阵格 ${cellCount[0].n} ≠ 档位 ${plans.length} × 权益 ${defCount[0].n} = ${expected}`);
    } else {
      summary.push(`[✓校验] 矩阵完整：${plans.length} 档 × ${defCount[0].n} 权益 = ${expected} 格`);
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
