/**
 * 研修班报名：新建 `training_enrollments`，旧的 `training_registrations` 整表封存
 *
 * 背景（2026-11-13，用户定）：
 *   - 定价只有一档：2800 元/人。页面上的「单人 / 2-3 人组团 / 企业内训」是企业自己的
 *     组织方式，不是定价方案，与 2800/人 不冲突。
 *   - 报名只收**参训学员本人**，不再区分「联系人」与「学员」两套字段。
 *   - 旧表 41 条为过期测试数据（期次 0 条、订单 0 条、学员名单 0 行），整体封存留档。
 *
 * 旧表为什么重命名而不是删：
 *   项目已有 `_bak_<日期>` 备份表惯例，`scripts/tools/baseline-exclude.mjs` 的 `/_bak_\d/`
 *   规则会自动把它排除出基线与 E2E 建库，既留了历史可查，又不会污染终态结构。
 *
 * 新表相对旧表去掉的死字段（都有查证）：
 *   - `audit_status`        只写不读（INSERT 时写 'pending'，全库无读取方）
 *   - `converted_supplier_id` / `portal_supplier_id`  零引用
 *   - `participants`(JSON)  41 行全 null，真实学员在 training_participants 表
 *   - `participant_count`   41 行全 1，单人报名下无意义
 *
 * 用法：
 *   npx tsx scripts/tools/training-enrollment-ddl.ts --preflight
 *   npx tsx scripts/tools/training-enrollment-ddl.ts --apply --yes
 *
 * 铁律：只建新表 + 重命名旧表；不删数据、不改其他表。
 */
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const PREFLIGHT = process.argv.includes("--preflight");
const YES = process.argv.includes("--yes");
/** 只建新表、暂不封存旧表：给「代码切换」留出无 500 窗口，切换完成后再跑一次封存 */
const CREATE_ONLY = process.argv.includes("--create-only");

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

const NEW_TABLE = "training_enrollments";
const OLD_TABLE = "training_registrations";
const BACKUP_TABLE = "training_registrations_bak_20261113";

const CREATE_SQL = `CREATE TABLE \`${NEW_TABLE}\` (
  \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
  \`full_name\` varchar(100) NOT NULL COMMENT '参训学员姓名',
  \`gender\` varchar(20) DEFAULT NULL COMMENT '性别',
  \`phone\` varchar(50) NOT NULL COMMENT '电话',
  \`position\` varchar(100) DEFAULT NULL COMMENT '职位',
  \`company_name\` varchar(255) NOT NULL COMMENT '企业名称',
  \`main_product\` varchar(255) DEFAULT NULL COMMENT '主营产品',
  \`export_experience\` varchar(255) DEFAULT NULL COMMENT '出口贸易经验',
  \`certification\` text COMMENT '持有资质证书：字典名称快照，换行分隔',
  \`remark\` text COMMENT '备注',
  \`email\` varchar(190) DEFAULT NULL COMMENT '邮箱：发票/通知发送',
  \`schedule_id\` int unsigned DEFAULT NULL COMMENT '报名期次 training_schedules.id',
  \`order_id\` bigint unsigned DEFAULT NULL COMMENT '关联订单 orders.id',
  \`payment_status\` varchar(20) NOT NULL DEFAULT 'unpaid' COMMENT 'unpaid/paid/refunded',
  \`amount\` decimal(10,2) DEFAULT NULL COMMENT '课程单价快照（2800 元/人）；实际应付 = 单价 × 参训人数，以 orders.amount 为准',
  \`ip\` varchar(45) DEFAULT NULL,
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`idx_te_schedule\` (\`schedule_id\`),
  KEY \`idx_te_order\` (\`order_id\`),
  KEY \`idx_te_payment_status\` (\`payment_status\`),
  KEY \`idx_te_created_at\` (\`created_at\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='研修班报名（一人一条，2800 元/人）'`;

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const [tables] = await conn.query(
  `SELECT TABLE_NAME t, TABLE_ROWS r FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?, ?, ?)`,
  [NEW_TABLE, OLD_TABLE, BACKUP_TABLE],
);
const found = new Map((tables as any[]).map((r) => [r.t, r.r]));

const hasNew = found.has(NEW_TABLE);
const hasOld = found.has(OLD_TABLE);
const hasBackup = found.has(BACKUP_TABLE);

console.log("=== 研修班报名表重建 ===");
console.log(`新表 ${NEW_TABLE}：${hasNew ? "已存在" : "待创建"}`);
console.log(`旧表 ${OLD_TABLE}：${hasOld ? `存在（约 ${found.get(OLD_TABLE) ?? "?"} 行）` : "不存在"}`);
console.log(`备份表 ${BACKUP_TABLE}：${hasBackup ? "已存在" : "待创建"}`);

if (hasNew && !hasOld) {
  console.log("\n✓ 已是目标状态（新表在、旧表已封存），无需动作");
  if (PREFLIGHT) console.log("（只读预览，未改动数据库）");
  await conn.end();
  process.exit(0);
}
if (hasBackup && hasOld) {
  console.error(`\n✗ 备份表 ${BACKUP_TABLE} 已存在，但旧表仍在——拒绝自动处理，请人工确认后再执行`);
  await conn.end();
  process.exit(1);
}

if (PREFLIGHT) {
  console.log("\n-- 计划 --");
  if (!hasNew) console.log(`  + 创建 ${NEW_TABLE}（学员本人 + 企业 + 期次 + 支付，共 19 列）`);
  if (hasOld) console.log(`  ~ 重命名 ${OLD_TABLE} → ${BACKUP_TABLE}（封存留档，baseline 自动排除）`);
  console.log("\n（只读预览，未改动数据库。执行请加 --apply --yes）");
  await conn.end();
  process.exit(0);
}

if (!hasNew) {
  await conn.query(CREATE_SQL);
  console.log(`✓ 创建 ${NEW_TABLE}`);
}

if (CREATE_ONLY) {
  if (hasOld) console.log(`  （--create-only：暂不封存 ${OLD_TABLE}，待代码切换完成后重跑执行）`);
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
    [NEW_TABLE],
  );
  console.log(`\n新表列（${(cols as any[]).length}）：${(cols as any[]).map((r) => r.c).join(",")}`);
  await conn.end();
  console.log("\n✓ 建表完成（旧表仍在）");
  process.exit(0);
}

if (hasOld) {
  await conn.query(`RENAME TABLE \`${OLD_TABLE}\` TO \`${BACKUP_TABLE}\``);
  console.log(`✓ 封存 ${OLD_TABLE} → ${BACKUP_TABLE}`);
}

const [cols] = await conn.query(
  `SELECT COLUMN_NAME c FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
  [NEW_TABLE],
);
console.log(`\n新表列（${(cols as any[]).length}）：${(cols as any[]).map((r) => r.c).join(",")}`);

await conn.end();
console.log("\n✓ 完成");
