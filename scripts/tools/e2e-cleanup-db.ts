/**
 * E2E 测试数据清理（采购主体 / 【E2E】项目 / 测试账号通知）
 *
 * @module scripts/tools/e2e-cleanup-db
 * @description 发布链与接口冒烟会往真库写数据。本脚本按「测试账号 + 【E2E】标记」清理：
 *              ① free@qq.com 名下的采购主体、项目、响应及派生行；
 *              ② 任意 buyer 下标题含【E2E】的项目及派生行；
 *              ③ 测试账号今天产生的通知（buyer.verified / procurement.* 等）。
 *              幂等，可反复执行；只删测试标记数据，不碰真实业务行。
 *
 * 用法：
 *   npx tsx scripts/tools/e2e-cleanup-db.ts
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

async function deleteDerived(projectIds: number[]): Promise<{ rows: number }> {
  if (projectIds.length === 0) return { rows: 0 };
  const projectIn = projectIds.map(() => "?").join(",");
  let responseIds: number[] = [];
  const [responses] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM procurement_responses WHERE project_id IN (${projectIn})`,
    projectIds,
  );
  responseIds = responses.map((r) => Number(r.id));
  const responseIn = responseIds.map(() => "?").join(",");

  const [tables] = await pool.query<RowDataPacket[]>(
    "SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'procurement\\_%'",
  );
  let deleted = 0;
  for (const row of tables) {
    const table = String(row.t);
    if (["procurement_projects", "procurement_buyers", "procurement_buyer_verifications"].includes(table)) continue;
    if (await columnExists(table, "project_id")) {
      const [res] = await pool.query(`DELETE FROM \`${table}\` WHERE project_id IN (${projectIn})`, projectIds);
      deleted += Number((res as { affectedRows?: number }).affectedRows ?? 0);
    }
    if (responseIds.length && (await columnExists(table, "response_id"))) {
      const [res] = await pool.query(`DELETE FROM \`${table}\` WHERE response_id IN (${responseIn})`, responseIds);
      deleted += Number((res as { affectedRows?: number }).affectedRows ?? 0);
    }
  }
  return { rows: deleted };
}

async function main(): Promise<void> {
  const [users] = await pool.query<RowDataPacket[]>("SELECT id FROM users WHERE email = ? LIMIT 1", [TEST_EMAIL]);
  const uid = users[0]?.id ? Number(users[0].id) : 0;

  // ① 测试账号名下的采购主体与项目
  let buyerIds: number[] = [];
  if (uid) {
    const [buyers] = await pool.query<RowDataPacket[]>("SELECT id FROM procurement_buyers WHERE user_id = ?", [uid]);
    buyerIds = buyers.map((b) => Number(b.id));
  }
  // 任何名字带 E2E 的采购主体（历史测试遗留，可能不属于测试账号）
  const [taggedBuyers] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM procurement_buyers WHERE org_name LIKE '%E2E%'",
  );
  for (const r of taggedBuyers) {
    const id = Number(r.id);
    if (!buyerIds.includes(id)) buyerIds.push(id);
  }
  let projectIds: number[] = [];
  if (buyerIds.length) {
    const buyerIn = buyerIds.map(() => "?").join(",");
    const [projects] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM procurement_projects WHERE buyer_id IN (${buyerIn})`,
      buyerIds,
    );
    projectIds = projects.map((p) => Number(p.id));
  }

  // ② 任意 buyer 下带【E2E】标记的项目
  const [tagged] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM procurement_projects WHERE title_zh LIKE '%【E2E】%' OR title_en LIKE '%【E2E】%'",
  );
  for (const r of tagged) {
    const id = Number(r.id);
    if (!projectIds.includes(id)) projectIds.push(id);
  }

  // ③ 采购主体已被删除的孤儿项目（历史测试数据残留）
  const [orphans] = await pool.query<RowDataPacket[]>(
    `SELECT p.id FROM procurement_projects p
       LEFT JOIN procurement_buyers b ON b.id = p.buyer_id
      WHERE b.id IS NULL`,
  );
  for (const r of orphans) {
    const id = Number(r.id);
    if (!projectIds.includes(id)) projectIds.push(id);
  }

  const derived = await deleteDerived(projectIds);
  if (projectIds.length) {
    await pool.query(`DELETE FROM procurement_projects WHERE id IN (${projectIds.map(() => "?").join(",")})`, projectIds);
  }
  if (buyerIds.length) {
    await pool.query(`DELETE FROM procurement_buyer_verifications WHERE buyer_id IN (${buyerIds.map(() => "?").join(",")})`, buyerIds);
    await pool.query(`DELETE FROM procurement_buyers WHERE id IN (${buyerIds.map(() => "?").join(",")})`, buyerIds);
  }

  // ④ 测试账号今天的通知（测试触发）
  let notifications = 0;
  if (uid) {
    const [res] = await pool.query(
      "DELETE FROM notifications WHERE user_id = ? AND created_at >= CURDATE()",
      [uid],
    );
    notifications = Number((res as { affectedRows?: number }).affectedRows ?? 0);
  }

  console.log(
    `[cleanup] ${TEST_EMAIL}(uid=${uid || "-"})：采购主体 ${buyerIds.length}、项目 ${projectIds.length}、派生行 ${derived.rows}、通知 ${notifications}`,
  );
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("[cleanup] 失败", err);
    await pool.end();
    process.exit(1);
  });
