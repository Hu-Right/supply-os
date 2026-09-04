/**
 * 真孤儿行清理脚本（user_id 内部化配套）
 * Orphan row purge: rows with user_id IS NULL whose user_key no longer exists in crm_users
 *
 * 三级策略（按数据性质）：
 *   DELETE   凭据/安全类：crm_refresh_tokens、crm_password_resets（过期令牌/验证码，保留即隐患）
 *   ANON     行为/画像类：user_key → NULL（保留群体统计价值，清除手机号形态标识）
 *   FINANCE  财务凭证类：行保留，user_key → NULL + 清空 PII 报文字段（金额/状态为对账凭证，不删）
 *
 * 用法：
 *   npx tsx scripts/purge-orphan-rows.ts             # dry-run：只输出将处理的行数清单
 *   npx tsx scripts/purge-orphan-rows.ts --execute   # 真正执行
 *
 * 安全边界：仅触碰 user_id IS NULL 的行（真孤儿 = user_key 已不在 crm_users，
 * 可回填行已由 backfillUserIds 处理完毕）。正常用户数据零接触。
 * 幂等：处理后行不再满足 WHERE 条件，重跑零副作用。
 */
import "dotenv/config";
import mysql2 from "mysql2/promise";

const EXECUTE = process.argv.includes("--execute");

/** DELETE：凭据/安全类 */
const DELETE_TABLES = ["crm_refresh_tokens", "crm_password_resets"];

/** ANON：行为/画像类（user_key → NULL；全部为 066 放松后的可空列） */
const ANON_TABLES = [
  "crm_user_search_log",
  "crm_user_interest_codes",
  "crm_user_industry_prefs",
  "crm_reco_weight_profile",
  "crm_opportunity_unlocks",
];

/** FINANCE：财务凭证类（行保留，user_key → NULL + PII 字段清空） */
const FINANCE_TABLES: Array<{ name: string; piiColumns: string[] }> = [
  { name: "crm_payment_orders", piiColumns: ["raw_request", "raw_notify"] },
  { name: "training_orders", piiColumns: ["contact_name", "telephone"] },
];

async function main() {
  const pool = mysql2.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3307),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "crm",
    connectionLimit: 2,
  });
  try {
    const mode = EXECUTE ? "EXECUTE（真实执行）" : "DRY-RUN（仅预览，加 --execute 执行）";
    console.log(`[purge] 模式：${mode}\n`);

    const report: Array<{ action: string; table: string; rows: number }> = [];

    for (const t of DELETE_TABLES) {
      const [r] = await pool.query(
        `SELECT COUNT(*) AS n FROM \`${t}\` WHERE user_id IS NULL`
      );
      const n = Number((r as any[])[0].n);
      if (EXECUTE && n > 0) await pool.execute(`DELETE FROM \`${t}\` WHERE user_id IS NULL`);
      report.push({ action: "DELETE", table: t, rows: n });
    }

    for (const t of ANON_TABLES) {
      const [r] = await pool.query(
        `SELECT COUNT(*) AS n FROM \`${t}\` WHERE user_id IS NULL AND user_key IS NOT NULL`
      );
      const n = Number((r as any[])[0].n);
      if (EXECUTE && n > 0) {
        await pool.execute(
          `UPDATE \`${t}\` SET user_key = NULL WHERE user_id IS NULL AND user_key IS NOT NULL`
        );
      }
      report.push({ action: "ANON(user_key→NULL)", table: t, rows: n });
    }

    for (const { name: t, piiColumns } of FINANCE_TABLES) {
      const setClause = ["user_key = NULL", ...piiColumns.map((c) => `${c} = NULL`)].join(", ");
      const [r] = await pool.query(
        `SELECT COUNT(*) AS n FROM \`${t}\` WHERE user_id IS NULL AND user_key IS NOT NULL`
      );
      const n = Number((r as any[])[0].n);
      if (EXECUTE && n > 0) {
        await pool.execute(`UPDATE \`${t}\` SET ${setClause} WHERE user_id IS NULL AND user_key IS NOT NULL`);
      }
      report.push({ action: `FINANCE(${piiColumns.join(",")} 清空)`, table: t, rows: n });
    }

    console.table(report);
    const total = report.reduce((s, r) => s + r.rows, 0);
    if (!EXECUTE) {
      console.log(`\n[purge] dry-run 完成，共 ${total} 行待处理。确认无误后执行：`);
      console.log("  npx tsx scripts/purge-orphan-rows.ts --execute");
    } else {
      console.log(`\n[purge] 执行完成，共处理 ${total} 行。`);
    }
  } finally {
    await pool.end();
  }
}
main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
