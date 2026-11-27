/**
 * E2E 测试夹具重置（free@qq.com）
 *
 * @module scripts/tools/e2e-reset-fixtures
 * @description 发布链用例会往真库写「【E2E】采购主体 + 需求/项目」，而「无采购主体 400」等断言
 *              要求该账号没有采购主体；重复跑必然互相污染。本脚本只清理测试账号名下的
 *              采购主体及其项目/响应等派生行，幂等、可反复执行。
 *
 * 用法：
 *   npx tsx scripts/tools/e2e-reset-fixtures.ts
 */
import { readFileSync } from "node:fs";
import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";

const TEST_EMAIL = process.env.E2E_FREE_USER ?? "free@qq.com";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const pool: Pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: "utf8mb4",
  connectionLimit: 2,
});

async function columnExists(table: string, column: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

async function main(): Promise<void> {
  const [users] = await pool.query<RowDataPacket[]>("SELECT id FROM users WHERE email = ? LIMIT 1", [TEST_EMAIL]);
  const uid = users[0]?.id ? Number(users[0].id) : 0;
  if (!uid) {
    console.log(`[reset] 未找到测试账号 ${TEST_EMAIL}，跳过`);
    return;
  }

  const [buyers] = await pool.query<RowDataPacket[]>("SELECT id FROM procurement_buyers WHERE user_id = ?", [uid]);
  const buyerIds = buyers.map((b) => Number(b.id));
  if (buyerIds.length === 0) {
    console.log(`[reset] ${TEST_EMAIL}(uid=${uid}) 无采购主体，已是干净状态`);
    return;
  }
  const buyerIn = buyerIds.map(() => "?").join(",");

  const [projects] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM procurement_projects WHERE buyer_id IN (${buyerIn})`,
    buyerIds,
  );
  const projectIds = projects.map((p) => Number(p.id));
  const projectIn = projectIds.map(() => "?").join(",");

  let responseIds: number[] = [];
  if (projectIds.length) {
    const [responses] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM procurement_responses WHERE project_id IN (${projectIn})`,
      projectIds,
    );
    responseIds = responses.map((r) => Number(r.id));
  }
  const responseIn = responseIds.map(() => "?").join(",");

  // 所有 procurement_* 派生表：按 project_id / response_id 清理
  const [tables] = await pool.query<RowDataPacket[]>(
    "SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'procurement\\_%'",
  );
  let cleaned = 0;
  for (const row of tables) {
    const table = String(row.t);
    if (table === "procurement_projects" || table === "procurement_buyers" || table === "procurement_buyer_verifications") continue;
    if (projectIds.length && (await columnExists(table, "project_id"))) {
      const [res] = await pool.query(`DELETE FROM \`${table}\` WHERE project_id IN (${projectIn})`, projectIds);
      cleaned += Number((res as { affectedRows?: number }).affectedRows ?? 0);
    }
    if (responseIds.length && (await columnExists(table, "response_id"))) {
      const [res] = await pool.query(`DELETE FROM \`${table}\` WHERE response_id IN (${responseIn})`, responseIds);
      cleaned += Number((res as { affectedRows?: number }).affectedRows ?? 0);
    }
  }

  if (projectIds.length) {
    const [res] = await pool.query(`DELETE FROM procurement_projects WHERE id IN (${projectIn})`, projectIds);
    cleaned += Number((res as { affectedRows?: number }).affectedRows ?? 0);
  }
  await pool.query(`DELETE FROM procurement_buyer_verifications WHERE buyer_id IN (${buyerIn})`, buyerIds);
  await pool.query(`DELETE FROM procurement_buyers WHERE id IN (${buyerIn})`, buyerIds);

  console.log(
    `[reset] ${TEST_EMAIL}(uid=${uid})：删除采购主体 ${buyerIds.length} 个、项目 ${projectIds.length} 个、响应 ${responseIds.length} 个，派生行 ${cleaned}`,
  );
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("[reset] 失败", err);
    await pool.end();
    process.exit(1);
  });
