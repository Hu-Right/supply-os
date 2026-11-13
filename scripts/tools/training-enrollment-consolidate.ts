/**
 * 研修班报名收敛：三张表 → 两张表（orders + training_enrollments）
 *
 * 背景（2026-11-13，用户定）：
 *   - 报名链路原先横跨 `training_enrollments`（报名人 1 条）+ `training_participants`
 *     （订单下 N 位学员）+ `orders`（统一订单），同一位学员的姓名/电话/职位/邮箱存两处。
 *   - 收敛口径：**一行 = 一位参训学员**。企业信息、期次作为快照冗余到每行（同一订单人数 1-20，
 *     逐行冗余换取「任一行都能独立还原完整报名」，导出/证书/CRM 无需 join 企业表）。
 *   - `payment_status` / `amount` 删除：订单状态唯一权威是 `orders.status`，
 *     单价唯一快照是 `orders.unit_price`。报名阶段没有订单，本来也不存在"已支付"的事实。
 *   - 新增 `user_id`：报名强制登录却只存了 ip，未成单的线索无法归属到人。
 *   - 新增 `participant_no`：同一订单内排序（原先靠 training_participants.participant_no）。
 *
 * 为什么可以直接 DROP 重建：
 *   2026-11-13 实测两表均 0 行（`training_registrations` 的 41 条历史数据已封存在
 *   `training_registrations_bak_20261113`，`orders` 中 product_kind='course' 亦为 0 行），
 *   因此无数据需要搬迁。脚本仍先导出两表 SHOW CREATE 到 `dumps/`，保证结构可回滚。
 *
 * 用法：
 *   npx tsx scripts/tools/training-enrollment-consolidate.ts --preflight
 *   npx tsx scripts/tools/training-enrollment-consolidate.ts --apply --yes
 *
 * 铁律：两表非空时拒绝执行（除非显式 --allow-data-loss），不做静默数据搬迁。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const PREFLIGHT = process.argv.includes("--preflight");
const YES = process.argv.includes("--yes");
const ALLOW_DATA_LOSS = process.argv.includes("--allow-data-loss");

if (APPLY && !YES) {
  console.error("✗ --apply 必须显式带 --yes（人工闸口）");
  process.exit(1);
}
if (!APPLY && !PREFLIGHT) {
  console.error("用法：--preflight（只读预览） | --apply --yes（执行）");
  process.exit(1);
}

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const ENROLLMENTS = "training_enrollments";
const PARTICIPANTS = "training_participants";

const CREATE_SQL = `CREATE TABLE \`${ENROLLMENTS}\` (
  \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
  \`user_id\` bigint unsigned NOT NULL COMMENT '报名账号 users.id（报名先于订单发生，必须独立可查）',
  \`order_id\` bigint unsigned DEFAULT NULL COMMENT '关联 orders.id；NULL=尚未成单的报名线索',
  \`schedule_id\` int unsigned DEFAULT NULL COMMENT '参训期次 training_schedules.id',
  \`participant_no\` int unsigned NOT NULL DEFAULT '1' COMMENT '同批报名内序号（1-based，用于排序）',
  \`full_name\` varchar(100) NOT NULL COMMENT '参训学员姓名',
  \`gender\` varchar(20) DEFAULT NULL COMMENT '性别（male/female/other）',
  \`phone\` varchar(50) NOT NULL COMMENT '学员手机号',
  \`position\` varchar(100) DEFAULT NULL COMMENT '职位',
  \`email\` varchar(190) DEFAULT NULL COMMENT '学员邮箱：开课通知与证书发放',
  \`invoice_email\` varchar(190) DEFAULT NULL COMMENT '发票/开课通知邮箱（企业区填写，逐行快照）',
  \`company_name\` varchar(255) NOT NULL COMMENT '企业名称快照',
  \`main_product\` varchar(255) DEFAULT NULL COMMENT '主营产品',
  \`export_experience\` varchar(255) DEFAULT NULL COMMENT '出口贸易经验',
  \`certification\` text COMMENT '持有资质证书：字典名称快照，换行分隔',
  \`remark\` text COMMENT '备注',
  \`ip\` varchar(45) DEFAULT NULL,
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`idx_te_order\` (\`order_id\`,\`participant_no\`),
  KEY \`idx_te_user\` (\`user_id\`,\`created_at\`),
  KEY \`idx_te_schedule\` (\`schedule_id\`),
  KEY \`idx_te_phone\` (\`phone\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='研修班报名（一行=一位参训学员，2800 元/人）'`;

/** 目标终态列清单（顺序即 ordinal position），执行后逐列核对 */
const EXPECTED_COLUMNS = [
  "id", "user_id", "order_id", "schedule_id", "participant_no",
  "full_name", "gender", "phone", "position", "email", "invoice_email",
  "company_name", "main_product", "export_experience", "certification",
  "remark", "ip", "created_at", "updated_at",
];

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

async function describe(table: string): Promise<{ exists: boolean; rows: number; ddl: string | null }> {
  const [t] = await conn.query(
    "SELECT TABLE_NAME t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
    [table],
  );
  if ((t as unknown[]).length === 0) return { exists: false, rows: 0, ddl: null };
  const [c] = await conn.query(`SELECT COUNT(*) n FROM \`${table}\``);
  const [[row]] = (await conn.query(`SHOW CREATE TABLE \`${table}\``)) as unknown as [Array<Record<string, string>>];
  return { exists: true, rows: Number((c as Array<{ n: number }>)[0].n), ddl: row["Create Table"] };
}

const enrollments = await describe(ENROLLMENTS);
const participants = await describe(PARTICIPANTS);

console.log("=== 研修班报名收敛（三表 → 两表） ===");
console.log(`  ${ENROLLMENTS}: ${enrollments.exists ? `存在，${enrollments.rows} 行` : "不存在"}`);
console.log(`  ${PARTICIPANTS}: ${participants.exists ? `存在，${participants.rows} 行` : "不存在"}`);

const totalRows = enrollments.rows + participants.rows;
if (totalRows > 0 && !ALLOW_DATA_LOSS) {
  console.error(
    `\n✗ 两表共 ${totalRows} 行数据。本脚本不搬迁数据，拒绝执行。` +
      `\n  请先确认这些行是否需要保留（如需，先导出再封存），确认可弃用后加 --allow-data-loss。`,
  );
  await conn.end();
  process.exit(1);
}

if (PREFLIGHT) {
  console.log("\n-- 计划 --");
  console.log(`  - DROP TABLE ${PARTICIPANTS}（学员并入 ${ENROLLMENTS}，一行一人）`);
  console.log(`  ~ DROP + CREATE ${ENROLLMENTS}（19 列：+user_id +participant_no +invoice_email -payment_status -amount）`);
  console.log(`  + 回滚 DDL 将写入 dumps/training-consolidate-<日期>.rollback.sql`);
  console.log("\n（只读预览，未改动数据库。执行请加 --apply --yes）");
  await conn.end();
  process.exit(0);
}

// ── 回滚物：先落盘再动库 ──────────────────────────────────────────────────────
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const dumpsDir = path.join(process.cwd(), "dumps");
mkdirSync(dumpsDir, { recursive: true });
const rollbackPath = path.join(dumpsDir, `training-consolidate-${stamp}.rollback.sql`);
const rollback = [
  `-- 回滚：研修班报名收敛（${new Date().toISOString()}）`,
  `-- 用法：mysql -h... < 本文件。注意：DROP 前的两表行数分别为 ${enrollments.rows} / ${participants.rows}，`,
  "--       本文件只恢复结构，不含数据（执行时两表为空，故无数据可丢）。",
  "SET FOREIGN_KEY_CHECKS = 0;",
  participants.ddl ? `DROP TABLE IF EXISTS \`${PARTICIPANTS}\`;\n${participants.ddl};` : `-- ${PARTICIPANTS} 不存在，无需恢复`,
  enrollments.ddl ? `DROP TABLE IF EXISTS \`${ENROLLMENTS}\`;\n${enrollments.ddl};` : `-- ${ENROLLMENTS} 不存在，无需恢复`,
  "SET FOREIGN_KEY_CHECKS = 1;",
].join("\n\n");
writeFileSync(rollbackPath, rollback, "utf8");
console.log(`\n✓ 回滚 DDL 已写入 ${path.relative(process.cwd(), rollbackPath)}`);

// ── 执行 ────────────────────────────────────────────────────────────────────
if (participants.exists) {
  await conn.query(`DROP TABLE \`${PARTICIPANTS}\``);
  console.log(`✓ 已删除 ${PARTICIPANTS}`);
}
if (enrollments.exists) {
  await conn.query(`DROP TABLE \`${ENROLLMENTS}\``);
  console.log(`✓ 已删除旧 ${ENROLLMENTS}`);
}
await conn.query(CREATE_SQL);
console.log(`✓ 已创建 ${ENROLLMENTS}（19 列）`);

// ── 校验 ────────────────────────────────────────────────────────────────────
const [cols] = await conn.query(
  `SELECT COLUMN_NAME c FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
  [ENROLLMENTS],
);
const actual = (cols as Array<{ c: string }>).map((r) => r.c);
const sameShape = actual.length === EXPECTED_COLUMNS.length
  && actual.every((c, i) => c === EXPECTED_COLUMNS[i]);
console.log(`\n终态列（${actual.length}）：${actual.join(",")}`);

const [left] = await conn.query(
  "SELECT TABLE_NAME t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
  [PARTICIPANTS],
);
const participantsGone = (left as unknown[]).length === 0;

await conn.end();

if (!sameShape || !participantsGone) {
  console.error("\n✗ 校验未通过：列顺序不符或 training_participants 仍存在");
  process.exit(1);
}
console.log("\n✓ 完成：两表终态（orders + training_enrollments），学员一行一人");
