/**
 * E2E 测试数据库种子脚本
 * E2E test database seeding
 *
 * 在 CI 或本地 E2E 测试前执行：
 * 1. 连接 MySQL 并创建测试数据库（若不存在）
 * 2. 运行全量 schema 迁移
 * 3. 写入种子数据（会员计划、底部链接等）
 * 4. 创建 E2E 专用测试账号
 *
 * 环境变量:
 *   MYSQL_HOST     (default: 127.0.0.1)
 *   MYSQL_PORT     (default: 3306)
 *   MYSQL_USER     (default: root)
 *   MYSQL_PASSWORD (default: "")
 *   MYSQL_DATABASE (default: supply_os_test)
 */
import mysql2 from "mysql2/promise";
import { runMigrations, type Migration } from "../src/lib/db/migrations/runner.js";
import { DbConfigSchema } from "../src/lib/db/db-config.js";
import { migration as m001 } from "../src/lib/db/migrations/001-core-tables.js";
import { migration as m002 } from "../src/lib/db/migrations/002-membership-payment.js";
import { migration as m003 } from "../src/lib/db/migrations/003-notice-interactions.js";
import { migration as m004 } from "../src/lib/db/migrations/004-search-quality-feedback.js";
import { migration as m005 } from "../src/lib/db/migrations/005-translations.js";
import { migration as m006 } from "../src/lib/db/migrations/006-suppliers.js";
import { migration as m007 } from "../src/lib/db/migrations/007-unspsc-bridge.js";
import { migration as m008 } from "../src/lib/db/migrations/008-agency-aliases.js";
import { migration as m009 } from "../src/lib/db/migrations/009-external-table-indexes.js";
import { migration as m010 } from "../src/lib/db/migrations/010-fulltext-indexes.js";
import { migration as m011 } from "../src/lib/db/migrations/011-notice-search-wide-table.js";
import { migration as m012 } from "../src/lib/db/migrations/012-password-reset-security.js";
import { migration as m013 } from "../src/lib/db/migrations/013-wide-table-varchar.js";
import { migration as m014 } from "../src/lib/db/migrations/014-password-reset-email-columns.js";
import { migration as m015 } from "../src/lib/db/migrations/015-registration-email-verification.js";
import { migration as m016 } from "../src/lib/db/migrations/016-user-phone.js";
import { migration as m017 } from "../src/lib/db/migrations/017-phone-verification.js";
import { migration as m018 } from "../src/lib/db/migrations/018-jwt-auth.js";
import { migration as m019 } from "../src/lib/db/migrations/019-reference-index.js";
import { migration as m020 } from "../src/lib/db/migrations/020-unlock-unique-notice.js";
import { migration as m021 } from "../src/lib/db/migrations/021-verification-code-hash-column.js";
import { migration as m022 } from "../src/lib/db/migrations/022-verification-code-composite-index.js";
import { migration as m023 } from "../src/lib/db/migrations/023-footer-social-links.js";
import { migration as m024 } from "../src/lib/db/migrations/024-bridge-int-and-index-cleanup.js";
import { migration as m025 } from "../src/lib/db/migrations/025-wide-table-reference-index.js";
import { migration as m026 } from "../src/lib/db/migrations/026-wide-table-cleanup.js";
import { migration as m027 } from "../src/lib/db/migrations/027-bridge-column-cleanup.js";
import { migration as m028 } from "../src/lib/db/migrations/028-deadline-sec-overflow.js";
import { migration as m029 } from "../src/lib/db/migrations/029-precise-unspsc.js";
import { migration as m030 } from "../src/lib/db/migrations/030-wide-table-deadline-bigint.js";
import { migration as m031 } from "../src/lib/db/migrations/031-membership-upgrade.js";
import { migration as m032 } from "../src/lib/db/migrations/032-wide-table-schema-converge.js";
import { migration as m033 } from "../src/lib/db/migrations/033-main-table-dead-index-cleanup.js";
import { migration as m034 } from "../src/lib/db/migrations/034-training-landing-page.js";
import { migration as m035 } from "../src/lib/db/migrations/035-training-team-titles.js";
import { migration as m036 } from "../src/lib/db/migrations/036-training-team-roles.js";
import { migration as m037 } from "../src/lib/db/migrations/037-training-order-payurl-text.js";
import { migration as m038 } from "../src/lib/db/migrations/038-training-participants.js";
import { migration as m039 } from "../src/lib/db/migrations/039-training-schedule-seed.js";
import { migration as m040 } from "../src/lib/db/migrations/040-training-participants-add-email.js";

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

  // 3. 运行全量 schema 迁移
  const migrations: Migration[] = [
    m001, m002, m003, m004, m005, m006, m007, m008, m009, m010,
    m011, m012, m013, m014, m015, m016, m017, m018, m019, m020,
    m021, m022, m023, m024, m025, m026, m027, m028, m029, m030,
    m031, m032, m033, m034, m035, m036, m037, m038, m039, m040,
  ];

  console.log("[seed-test-db] 运行 schema 迁移 ...");
  await runMigrations(pool, migrations);
  console.log("[seed-test-db] Schema 迁移完成");

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
  const [countRows] = await pool.query("SELECT COUNT(*) AS total FROM crm_suppliers");
  const total = Number((countRows as { total: number }[])[0]?.total || 0);
  if (total > 0) return;

  await pool.execute(
    "INSERT IGNORE INTO crm_suppliers (user_key, company_name, country, industry, status, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
    [
    "e2e-vip@test.com",
    "E2E Test Supplier Co.",
    "China",
    "Construction",
    "active",
  ]);
  console.log("[seed-test-db] 测试供应商种子数据写入完成");
}

main().catch((err) => {
  console.error("[seed-test-db] ✗ 失败:", err);
  process.exit(1);
});
