/**
 * E2E 测试数据库种子脚本
 * E2E test database seeding
 *
 * 在 CI 或本地 E2E 测试前执行：
 * 1. 连接 MySQL 并创建测试数据库（若不存在）
 * 2. 校验目标库已有表结构（迁移清单已收敛为空，因此本脚本不建表）
 * 3. 写入「应用能开机」所需的权益目录骨架 + 底部链接 + 公告/供应商靶点
 * 4. 创建可登录的 E2E 专用账号（VIP 带生效订阅，free 不带）
 * 5. 创建商机解锁靶点，并把其 id 打印出来供 CI 用环境变量接线
 *
 * ⚠️ 结构事实源是 db/schema/*.sql：本脚本里每张表、每个列名都必须能在结构基线里找到，
 *    由 scripts/gates/check-seed-schema-compat.mjs 在 lint/CI 静态核对（改库先重跑
 *    scripts/tools/dump-schema-baseline.mjs，再回来改这里）。
 * ⚠️ 只写合成值，不复制生产配置：套餐价格/额度都是占位数字，真实报价表按仓库边界不入库。
 *
 * 环境变量:
 *   MYSQL_HOST     (default: 127.0.0.1)
 *   MYSQL_PORT     (default: 3306)
 *   MYSQL_USER     (default: root)
 *   MYSQL_PASSWORD (default: "")
 *   MYSQL_DATABASE (default: supply_os_test)
 *   E2E_TEST_PASSWORD (default: test-password)  种子账号口令，须与 E2E 用例读到的一致
 */
import mysql2 from "mysql2/promise";
import { DbConfigSchema } from "../../src/lib/db/db-config.js";
import { hashPassword } from "../../src/lib/services/auth.js";

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
const E2E_TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || "test-password";

// ── 合成靶点 id：统一占高位区间，避免与任何回填数据撞号，且便于 CI 用环境变量指认 ──
export const E2E_OPP_ID = 900001;
export const E2E_OPP_CODE_ID = 900001;
const E2E_NOTICE_IDS = [900001, 900002, 900003, 900004, 900005];

/** 权益目录骨架：应用侧按码直查（见 src/lib/services/benefit-matrix.ts / unlock-quota.ts） */
const BENEFITS: Array<{ code: string; name: string; kind: "bool" | "quota"; sort: number }> = [
  { code: "notice_view", name: "标讯查看额度（E2E 合成）", kind: "quota", sort: 1 },
  { code: "notice_translation", name: "标讯中文译文（E2E 合成）", kind: "bool", sort: 2 },
  { code: "advanced_keyword_search", name: "高级关键词检索（E2E 合成）", kind: "bool", sort: 3 },
  { code: "industry_scoped", name: "行业限定检索（E2E 合成）", kind: "bool", sort: 4 },
  { code: "all_category_access", name: "全类目访问（E2E 合成）", kind: "bool", sort: 5 },
];
const FREE_PLAN = "free";
const VIP_PLAN = "e2e_pro";

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
      `  方法：mysql -h<host> -P<port> -u<user> -p <DB_NAME> < db/schema/baseline.sql 后重跑本脚本\n` +
      `        （基线由 node --env-file=.env scripts/tools/dump-schema-baseline.mjs 生成）。`,
    );
  }
  console.log(`[seed-test-db] 目标库已有 ${tableCount} 张表，跳过结构建立（迁移链已清空）`);

  // 4. 配置骨架 → 业务靶点 → 账号（顺序即依赖顺序：矩阵外键指向两张目录）
  console.log("[seed-test-db] 写入种子数据 ...");
  await seedBenefitCatalog(pool);
  await seedFooterLinks(pool);
  await seedTestNotices(pool);
  await seedTestSuppliers(pool);
  const vipUserId = await seedE2EUser(pool, "e2e-vip@test.com", "E2E VIP User");
  const freeUserId = await seedE2EUser(pool, "e2e-free@test.com", "E2E Free User");
  await seedVipSubscription(pool, vipUserId);
  await seedE2EOpportunity(pool);

  await pool.end();
  console.log("[seed-test-db] ✓ 测试数据库准备完成");
  console.log(
    `[seed-test-db] E2E 靶点：VIP uid=${vipUserId} free uid=${freeUserId} ` +
    `OPP_ID=${E2E_OPP_ID} OPP_CODE_ID=${E2E_OPP_CODE_ID}（用例侧用 E2E_VIP_USER / E2E_FREE_USER / ` +
    `E2E_OPP_ID / E2E_OPP_CODE_ID 指认）`,
  );
}

// ── 权益体系目录（原生单轨模型：两张目录 + 一张矩阵，代码里不写额度数字）────────────
async function seedBenefitCatalog(pool: mysql2.Pool) {
  await pool.execute(
    `INSERT IGNORE INTO crm_plan_catalog
       (plan_code, name_en, name_zh, positioning_zh, price, price_mode, currency,
        billing_period_days, commercial_tier, cta_i18n_key, badge, sort_order, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      // free 档不售卖：is_active=0 且 price_mode=free（chk_price_mode 要求 fixed 必须 >0）
      FREE_PLAN, "FREE", "普通用户", "E2E 合成基线档", 0, "free", "CNY",
      null, "L1", "membership.cta.free", "none", 0, 0,
      // 唯一在售档：价格与额度都是占位值，只为让门控/配额链路可判定
      VIP_PLAN, "E2E PRO", "E2E 测试档", "E2E 合成付费档", 1, "fixed", "CNY",
      365, "L2", "membership.cta.subscribe", "most_popular", 1, 1,
    ],
  );

  await pool.execute(
    `INSERT IGNORE INTO crm_benefit_catalog (benefit_code, name_zh, value_kind, sort_order)
     VALUES ${BENEFITS.map(() => "(?, ?, ?, ?)").join(", ")}`,
    BENEFITS.flatMap((b) => [b.code, b.name, b.kind, b.sort]),
  );

  // 每格只能有恰好一个值列（chk_one_value）：quota 用 value_num，bool 用 value_level
  const cells: Array<string | number | null> = [];
  for (const plan of [FREE_PLAN, VIP_PLAN]) {
    const paid = plan === VIP_PLAN;
    for (const b of BENEFITS) {
      cells.push(
        plan,
        b.code,
        b.kind === "bool" ? (paid ? 1 : 0) : null,
        b.kind === "quota" ? (paid ? 50 : 0) : null,
        paid ? "E2E 合成额度" : "E2E 合成零额度",
      );
    }
  }
  await pool.execute(
    `INSERT IGNORE INTO crm_plan_benefits (plan_code, benefit_code, value_level, value_num, note_zh)
     VALUES ${Array.from({ length: BENEFITS.length * 2 }, () => "(?, ?, ?, ?, ?)").join(", ")}`,
    cells,
  );
  console.log("[seed-test-db] 权益目录与矩阵骨架写入完成");
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

/**
 * 创建可登录的 E2E 账号。
 *
 * 口令走应用自己的 hashPassword（bcrypt），与登录侧 verifyPassword 同源——
 * 在这里手搓一份哈希算法等于再造一个会漂移的口令口径。
 * email 上没有唯一键，所以先查后插而不是依赖 INSERT IGNORE。
 */
async function seedE2EUser(pool: mysql2.Pool, email: string, nickname: string): Promise<number> {
  const [existing] = await pool.query("SELECT id FROM crm_users WHERE email = ? LIMIT 1", [email]);
  const hit = (existing as { id: number | string }[])[0];
  if (hit) {
    // 已存在也要把口令刷回当前 env：CI 里口令轮换后旧哈希会让登录静默 401
    const hash = await hashPassword(E2E_TEST_PASSWORD);
    await pool.execute(
      "UPDATE crm_users SET password_hash = ?, password_hash_type = 'bcrypt', account_status = 'active' WHERE id = ?",
      [hash, Number(hit.id)],
    );
    return Number(hit.id);
  }
  const hash = await hashPassword(E2E_TEST_PASSWORD);
  const [res] = await pool.execute(
    `INSERT INTO crm_users (email, nickname, display_name, password_hash, password_hash_type,
                            account_status, user_type, email_verified)
     VALUES (?, ?, ?, ?, 'bcrypt', 'active', 'personal', 1)`,
    [email, nickname, nickname, hash],
  );
  return Number((res as { insertId: number | string }).insertId);
}

/** VIP 的生效订阅：解锁配额池由应用按矩阵 value_num 懒开，这里不预建 crm_benefit_quotas */
async function seedVipSubscription(pool: mysql2.Pool, userId: number) {
  const [existing] = await pool.query(
    "SELECT id FROM crm_plan_subscriptions WHERE owner_user_id = ? AND status = 'active' LIMIT 1",
    [userId],
  );
  if ((existing as unknown[]).length > 0) return;

  await pool.execute(
    `INSERT INTO crm_plan_subscriptions
       (owner_user_id, plan_code, source_order_no, price_paid, currency, status, started_at, expires_at)
     VALUES (?, ?, ?, ?, 'CNY', 'active', NOW(), DATE_ADD(NOW(), INTERVAL 365 DAY))`,
    [userId, VIP_PLAN, `E2E-SEED-${userId}`, 1],
  );
  console.log(`[seed-test-db] VIP uid=${userId} 生效订阅（档 ${VIP_PLAN}）写入完成`);
}

async function seedTestNotices(pool: mysql2.Pool) {
  const [countRows] = await pool.query("SELECT COUNT(*) AS total FROM crm_bid_notices");
  const total = Number((countRows as { total: number }[])[0]?.total || 0);
  if (total > 0) return;

  // 插入 5 条测试采购公告（覆盖不同类型和国家）；仅用合法可插入列，7 占位符全参数化
  await pool.execute(
    "INSERT IGNORE INTO crm_bid_notices (id, notice_id, title, notice_type, country, agency, description) VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)",
    [
    900001, "SEED-001", "Construction of School Buildings - UNICEF", "ITB", "China", "UNICEF", "Test notice for E2E",
    900002, "SEED-002", "Supply of Medical Equipment - WHO", "RFQ", "Brazil", "WHO", "Test notice for E2E",
    900003, "SEED-003", "IT Services Contract - UNDP", "RFP", "India", "UNDP", "Test notice for E2E",
    900004, "SEED-004", "Road Rehabilitation - World Bank", "ITB", "Kenya", "World Bank", "Test notice for E2E",
    900005, "SEED-005", "Consulting Services - UNESCO", "EOI", "France", "UNESCO", "Test notice for E2E",
  ]);
  console.log(`[seed-test-db] 测试采购公告种子数据写入完成（${E2E_NOTICE_IDS.length} 条）`);
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

/**
 * 商机解锁靶点：一条商机 + 一个字典节点 + 一条桥表行。
 *
 * /api/opportunities?code_id=N 会先用 N 查 crm_unspsc_codes 拿 level，再按 levelN_id
 * 关联桥表；三者齐备才能让「列表 → 脱敏」与「付费解锁 → 幂等」两条旅程在空库上跑通。
 */
async function seedE2EOpportunity(pool: mysql2.Pool) {
  await pool.execute(
    `INSERT IGNORE INTO crm_unspsc_codes (id, code, title, title_zh, parent_id, level)
     VALUES (?, ?, ?, ?, NULL, ?)`,
    [E2E_OPP_CODE_ID, "43211503", "Network infrastructure (E2E)", "网络设备（E2E 合成）", 4],
  );

  await pool.execute(
    `INSERT IGNORE INTO crm_bid_opportunities
       (id, source_platform, source_notice_id, title, reference, notice_type, agency, country,
        deadline_ts, description, status, is_qualified, is_expired)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
    E2E_OPP_ID, "ungm", "SEED-001",
    "E2E Test Opportunity - Network Infrastructure Supply",
    "E2E-REF-0001", "ITB", "UNDP", "China",
    0, "E2E 合成商机靶点，用于解锁旅程。".repeat(20),
    1, 1, 0,
  ]);

  await pool.execute(
    `INSERT IGNORE INTO crm_bid_opportunity_unspsc_codes
       (opportunity_id, code_id, code, name, level, level1_id, level2_id, level3_id, level4_id, level5_id)
     VALUES (?, ?, ?, ?, ?, '', '', '', ?, '')`,
    [E2E_OPP_ID, E2E_OPP_CODE_ID, "43211503", "Network infrastructure (E2E)", 4, String(E2E_OPP_CODE_ID)],
  );
  console.log(`[seed-test-db] 商机靶点 opp=${E2E_OPP_ID} code_id=${E2E_OPP_CODE_ID} 写入完成`);
}

main().catch((err) => {
  console.error("[seed-test-db] ✗ 失败:", err);
  process.exit(1);
});
