/**
 * E2E 测试数据库种子脚本
 * E2E test database seeding
 *
 * 在 CI 或本地 E2E 测试前执行：
 * 1. 连接 MySQL 并创建测试数据库（若不存在）
 * 2. 校验目标库已有表结构（迁移机制已恢复但清单为空，因此本脚本仍不建表）
 * 3. 写入种子数据（会员计划、底部链接等）
 * 4. 创建 E2E 专用测试账号
 *
 * ⚠️ 测试库结构需自行准备：从生产结构快照导入
 *    docs/数据库设计/_baseline-20260929/schema-all-tables.sql（全库终态 DDL）。
 *
 * 环境变量:
 *   MYSQL_HOST     (default: 127.0.0.1)
 *   MYSQL_PORT     (default: 3306)
 *   MYSQL_USER     (default: root)
 *   MYSQL_PASSWORD (default: "")
 *   MYSQL_DATABASE (default: supply_os_test)
 */
import mysql2 from "mysql2/promise";
import { DbConfigSchema } from "../src/lib/db/db-config.js";

const DB_HOST = process.env.MYSQL_HOST || "127.0.0.1";
const DB_PORT = Number(process.env.MYSQL_PORT || 3306);
const DB_USER = process.env.MYSQL_USER || "root";
const DB_PASSWORD = process.env.MYSQL_PASSWORD || "";
// fail-fast：env 派生连接配置经 zod 运行时校验后才建池（净化解直连 createConnection/createPool）
const DB_CFG = DbConfigSchema.parse({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: process.env.MYSQL_DATABASE || "supply_os_test",
});
const DB_NAME = process.env.MYSQL_DATABASE || "supply_os_test";

async function main() {
  console.log(`[seed-test-db] 连接 MySQL ${DB_HOST}:${DB_PORT} ...`);

  // 1. 先不带 database 连接，创建测试库
  // 校验库名：CREATE DATABASE 的标识符无法参数化，仅允许安全字符集
  if (!/^[A-Za-z0-9_]+$/.test(DB_NAME)) {
    throw new Error(`[seed-test-db] 非法数据库名: ${DB_NAME}`);
  }
  const bootstrap = await mysql2.createConnection({
    host: DB_CFG.host,
    port: DB_CFG.port,
    user: DB_CFG.user,
    password: DB_CFG.password,
  });

  await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  console.log(`[seed-test-db] 数据库 ${DB_NAME} 就绪`);
  await bootstrap.end();

  // 2. 连接到测试库
  const pool = mysql2.createPool({
    host: DB_CFG.host,
    port: DB_CFG.port,
    user: DB_CFG.user,
    password: DB_CFG.password,
    database: DB_CFG.database,
    waitForConnections: true,
    connectionLimit: 5,
  });

  // 3. 结构前置校验：迁移机制已恢复（src/lib/db/schema.ts 的 ALL_MIGRATIONS），但当前清单为空，
  //    所以这里不跑迁移而是直接要求结构已就位；空库一律 fail-fast，避免静默建出一个
  //    “表都不存在”的测试库、到 E2E 阶段才以莫名的 SQL 错误暴露。
  //    将来若写入真迁移，把这里换成 runMigrations(pool, ALL_MIGRATIONS) 即可。
  const [tbl] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`,
  );
  const tableCount = Number((tbl as Array<{ c: number | string }>)[0]?.c || 0);
  if (tableCount === 0) {
    await pool.end();
    throw new Error(
      `[seed-test-db] 库 ${DB_NAME} 内 0 张表：测试库结构需先导入。\n` +
      `  方法：把 docs/数据库设计/_baseline-20260929/schema-all-tables.sql 灌入该库后重跑本脚本。`,
    );
  }
  console.log(`[seed-test-db] 目标库已有 ${tableCount} 张表，跳过结构建立（迁移链已清空）`);

  // 4. 写入种子数据（会员计划）
  console.log("[seed-test-db] 写入种子数据 ...");
  await seedMembershipPlans(pool);
  await seedFooterLinks(pool);
  await seedTestNotices(pool);
  await seedTestSuppliers(pool);

  // 5. 创建 E2E 测试专用账号
  await seedE2EUsers(pool);

  await pool.end();
  console.log("[seed-test-db] ✓ 测试数据库准备完成");
}

async function seedMembershipPlans(pool: mysql2.Pool) {
  const [countRows] = await pool.query("SELECT COUNT(*) AS total FROM crm_membership_plans");
  const total = Number((countRows as { total: number }[])[0]?.total || 0);
  if (total > 0) return;

  // 全参数化：11 列 × 4 行占位符，值经 execute 参数数组传入
  await pool.execute(
    "INSERT IGNORE INTO crm_membership_plans (plan_code, name, description, price, currency, duration_days, unlock_quota, free_quota, plan_type, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
    "free", "基础体验版", "免费注册", 0, "CNY", null, 3, 3, "free", 1, 0,
    "single_199", "单次解锁卡", "单次解锁", 199, "CNY", null, 1, 0, "single", 101, 1,
    "annual_799", "标讯个人会员", "个人年度会员", 799, "CNY", 365, 100, 0, "bundle", 102, 0,
    "annual_8800", "标讯企业会员-基础版", "企业基础版", 8800, "CNY", 365, 365, 0, "subscription", 103, 0,
  ]);
  console.log("[seed-test-db] 会员计划种子数据写入完成");
}

async function seedFooterLinks(pool: mysql2.Pool) {
  const [countRows] = await pool.query("SELECT COUNT(*) AS total FROM link");
  const total = Number((countRows as { total: number }[])[0]?.total || 0);
  if (total > 0) return;

  await pool.execute(
    "INSERT IGNORE INTO link (name, url, icon, sort_order, status) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)",
    [
    "Instagram", "https://www.instagram.com", "instagram", 1, 1,
    "Facebook", "https://www.facebook.com", "facebook", 2, 1,
    "WhatsApp", "https://www.whatsapp.com", "whatsapp", 3, 1,
  ]);
  console.log("[seed-test-db] 底部链接种子数据写入完成");
}

async function seedE2EUsers(pool: mysql2.Pool) {
  // 创建 E2E 测试用 VIP 用户（已付费，有解锁额度）
  await pool.execute(
    "INSERT IGNORE INTO crm_users (user_key, email, name, role, is_vip, vip_expires_at, unlock_quota, unlock_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
    "e2e-vip@test.com",
    "e2e-vip@test.com",
    "E2E VIP User",
    "user",
    1,
    new Date(Date.now() + 365 * 86400000), // 1 年后过期
    100,
    5,
  ]);

  // 创建 E2E 测试用免费用户
  await pool.execute(
    "INSERT IGNORE INTO crm_users (user_key, email, name, role, is_vip, unlock_quota, unlock_used) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
    "e2e-free@test.com",
    "e2e-free@test.com",
    "E2E Free User",
    "user",
    0,
    3,
    0,
  ]);

  console.log("[seed-test-db] E2E 测试账号创建完成");
}

async function seedTestNotices(pool: mysql2.Pool) {
  const [countRows] = await pool.query("SELECT COUNT(*) AS total FROM crm_bid_notices");
  const total = Number((countRows as { total: number }[])[0]?.total || 0);
  if (total > 0) return;

  // 插入 5 条测试采购公告（覆盖不同类型和国家），35 个占位符全参数化
  await pool.execute(
    "INSERT IGNORE INTO crm_bid_notices (reference_no, title, notice_type, country, agency, deadline_sec, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW()), (?, ?, ?, ?, ?, ?, ?, NOW()), (?, ?, ?, ?, ?, ?, ?, NOW()), (?, ?, ?, ?, ?, ?, ?, NOW()), (?, ?, ?, ?, ?, ?, ?, NOW())",
    [
    "REF-TEST-001", "Construction of School Buildings - UNICEF", "ITB", "China", "UNICEF", 0, "Test notice for E2E", 
    "REF-TEST-002", "Supply of Medical Equipment - WHO", "RFQ", "Brazil", "WHO", 0, "Test notice for E2E",
    "REF-TEST-003", "IT Services Contract - UNDP", "RFP", "India", "UNDP", 0, "Test notice for E2E",
    "REF-TEST-004", "Road Rehabilitation - World Bank", "ITB", "Kenya", "World Bank", 0, "Test notice for E2E",
    "REF-TEST-005", "Consulting Services - UNESCO", "EOI", "France", "UNESCO", 0, "Test notice for E2E",
  ]);
  console.log("[seed-test-db] 测试采购公告种子数据写入完成");
}

async function seedTestSuppliers(pool: mysql2.Pool) {
  const [countRows] = await pool.query("SELECT COUNT(*) AS total FROM supplier WHERE company = ?", ["E2E Test Supplier Co."]);
  const total = Number((countRows as { total: number }[])[0]?.total || 0);
  if (total > 0) return;

  // 写入一条已审核通过的供应商（supplier 为供应商唯一数据源）
  await pool.execute(
    "INSERT IGNORE INTO supplier (company, country, industry, verify_status, addtime) VALUES (?, ?, ?, ?, ?)",
    [
    "E2E Test Supplier Co.",
    "China",
    "Construction",
    "done",
    Math.floor(Date.now() / 1000),
  ]);
  console.log("[seed-test-db] 测试供应商种子数据写入完成");
}

main().catch((err) => {
  console.error("[seed-test-db] ✗ 失败:", err);
  process.exit(1);
});
