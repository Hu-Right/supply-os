/**
 * 影子表阶段一：按 crm_users 建一张 id 从 1 连续的新表 crm_users__new（原表不动）
 *
 * 产物：
 *   crm_users__new   —— 对齐 crm_users 结构并退役三列、id 重排为 1..N 连续、数据全量保留
 *   crm_users__idmap —— old_id → new_id 映射表（阶段二据此级联改写各表 user_id 列）
 *
 * 列精简（目标形态，本表已不含以下三列）：
 *   · nickname_source —— 无业务后果的元标记，无读取方
 *   · qualification_id —— 冗余反向指针，用户↔诊断关系的事实源在 crm_supplier_qualification.user_id
 *   · membership_tier —— 会员身份 SSOT 在 crm_plan_subscriptions / crm_subscription_seats，本列仅落库镜像
 *
 * ⚠ 阶段二切换的硬前置（否则切换瞬间即报错）：membership_tier 在本表已退役，但活表
 *   crm_users 仍保留该列且存在两类在线消费方，RENAME 前必须先去引用：
 *     1) 本仓 supply-os：users.repo.create() 的 INSERT 列 + findProfileById / findAuthByPhone /
 *        findAuthByIdentifier 三处 SELECT + timers.ts demoteExpiredVipTier 每日降级作业；
 *     2) 后台项目 intelligence-daily（独立进程、不随本仓发版）共 6 处：os-user 建号 INSERT 与
 *        升降 VIP UPDATE、membership/entitlement 按 tier 查询与改写、chat 客服台 AS customer_membership、
 *        report/overview 大屏 GROUP BY membership_tier、audit 列白名单——均需改读订阅体系。
 *
 * 安全边界：
 *   - 只 CREATE/DROP 带 __new / __idmap 后缀的两张新表，绝不写 crm_users 本体；
 *   - 可重复执行（幂等）：重跑会重建这两张表并重新回填；
 *   - 回填后做逐列 NULL-safe 全等校验 + id 连续性校验，任一不符即非零退出且不留下半成品结论。
 *
 * 用法：node scripts/shadow-users-phase1.mjs
 */
import fs from "fs";
import mysql from "mysql2/promise";

const env = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^DB_[A-Z]+=/ && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/["']/g, "").trim()]),
);

const pool = await mysql.createPool({
  host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME, charset: "utf8mb4", connectionLimit: 2,
});

const NEW_TABLE = "crm_users__new";
const MAP_TABLE = "crm_users__idmap";

/** 本次重构从影子表移除的列（见顶部说明与切换硬前置） */
const DROPPED_COLUMNS = new Set(["nickname_source", "qualification_id", "membership_tier"]);

function fail(msg) {
  console.error(`\n[FATAL] ${msg}`);
  process.exitCode = 1;
  throw new Error(msg);
}

// ── 0. 读取 crm_users 真实列清单（除 id），用于回填与校验，避免手写漏列 ──
const [srcCols] = await pool.query(
  `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'crm_users' AND COLUMN_NAME <> 'id'
    ORDER BY ORDINAL_POSITION`,
  [env.DB_NAME],
);
const COLS = srcCols.map((r) => r.COLUMN_NAME).filter((c) => !DROPPED_COLUMNS.has(c));
if (COLS.length < 15) fail(`crm_users 列数异常（读到 ${COLS.length} 列），中止`);
console.log(`[0] 源表 crm_users 非 id 列 ${srcCols.length} 个，排除退役列 [${[...DROPPED_COLUMNS].join(", ")}] 后回填 ${COLS.length} 列`);

const [[srcStat]] = await pool.query(
  `SELECT COUNT(*) AS total, COALESCE(MIN(id),0) AS min_id, COALESCE(MAX(id),0) AS max_id FROM crm_users`,
);
console.log(`[0] 源表行数=${Number(srcStat.total)} id范围=${Number(srcStat.min_id)}..${Number(srcStat.max_id)}（不连续）`);
if (Number(srcStat.total) === 0) fail("crm_users 为空表，无需建影子表");

// 值域快照（仅为打印核对注释口径，不参与建表逻辑）
for (const col of ["account_status", "membership_tier", "user_type", "supplier_link_status", "password_hash_type"]) {
  const [d] = await pool.query(`SELECT \`${col}\` v, COUNT(*) n FROM crm_users GROUP BY \`${col}\` ORDER BY n DESC`);
  console.log(`    ${col}: ${d.map((r) => `${r.v ?? "NULL"}×${r.n}`).join("  ")}`);
}

// ── 1. 建影子表（结构对齐 + 索引收敛 + 表/列 COMMENT）──
//     收敛点：① 旧表 phone 上有两个同定义唯一索引（idx_users_phone / idx_users_phone_unique）→ 合一为 uk_phone；
//            ② idx_supplier_id(supplier_id) 被 idx_supplier_link(supplier_id, supplier_link_status) 最左前缀覆盖 → 去冗余。
await pool.query(`DROP TABLE IF EXISTS \`${NEW_TABLE}\``);
await pool.query(`
  CREATE TABLE ${NEW_TABLE} (
    id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户 ID（影子表重排后自 1 连续；业务身份锚点仍是 phone）',
    email                VARCHAR(190)    NULL COMMENT '邮箱（注册不强制，可个人中心补绑；登录双轨之一）',
    phone                VARCHAR(20)     NULL COMMENT '手机号（注册即登录账号，唯一）',
    phone_verified       TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '手机号是否已验证 0否/1是',
    display_name         VARCHAR(190)    NULL COMMENT '真实姓名（注册填写；不进入任何对外 API 响应）',
    nickname             VARCHAR(100)    NULL COMMENT '对外展示昵称',
    password_hash        VARCHAR(128)    NULL COMMENT '密码哈希（不存明文）',
    password_hash_type   VARCHAR(20)     NOT NULL DEFAULT 'sha256' COMMENT '哈希算法：bcrypt=新 / sha256=存量兼容（登录时可透明升级）',
    account_status       VARCHAR(30)     NOT NULL DEFAULT 'pending' COMMENT '账号状态；disabled/rejected 登录与刷新均拒绝',
    user_type            VARCHAR(20)     NOT NULL DEFAULT 'enterprise' COMMENT '用户类型 personal=个人 / enterprise=企业',
    supplier_id          BIGINT UNSIGNED NULL COMMENT '绑定的企业档案 ID（supplier.id）',
    supplier_link_status VARCHAR(30)     NOT NULL DEFAULT 'none' COMMENT '企业关联状态；verified 才随登录下发企业信息',
    referral_code        VARCHAR(20)     NULL COMMENT '注册时填写的邀请码（拉新归因）',
    referral_employee_id INT UNSIGNED    NULL COMMENT '邀请码对应员工 ID（crm_employees.id）',
    created_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '注册时间',
    updated_at           DATETIME        NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '资料最后修改时间',
    email_verified       TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '邮箱是否已验证 0否/1是',
    last_login_at        DATETIME        NULL COMMENT '最近登录时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_phone (phone),
    INDEX idx_user_type (user_type),
    INDEX idx_supplier_link (supplier_id, supplier_link_status),
    INDEX idx_referral (referral_employee_id, referral_code),
    INDEX idx_created_at (created_at)
  ) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    COMMENT='用户主表影子新表（阶段一）：id 重排为 1..N 连续，已退役 membership_tier/nickname_source/qualification_id 三列；切换前需先摘除对 membership_tier 的在线读写'
`);
console.log(`[1] 已建影子表 ${NEW_TABLE}（AUTO_INCREMENT=1，索引已收敛）`);

// ── 2. 建映射表并生成 new_id（按旧 id 升序编号，保证稳定可复现）──
await pool.query(`DROP TABLE IF EXISTS \`${MAP_TABLE}\``);
await pool.query(`
  CREATE TABLE ${MAP_TABLE} (
    old_id BIGINT UNSIGNED NOT NULL COMMENT '原 crm_users.id',
    new_id BIGINT UNSIGNED NOT NULL COMMENT '影子表 id（1..N 连续）',
    phone  VARCHAR(20)     NULL COMMENT '冗余手机号，便于人工核对',
    PRIMARY KEY (old_id),
    UNIQUE KEY uk_new_id (new_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    COMMENT='用户 id 重排映射表（阶段一产物）：阶段二据此级联改写所有指向 crm_users.id 的列'
`);
await pool.query(`
  INSERT INTO ${MAP_TABLE} (old_id, new_id, phone)
  SELECT id, ROW_NUMBER() OVER (ORDER BY id), phone FROM crm_users
`);
const [[mapStat]] = await pool.query(`SELECT COUNT(*) n, MIN(new_id) mn, MAX(new_id) mx FROM ${MAP_TABLE}`);
console.log(`[2] 映射表 ${MAP_TABLE}：${Number(mapStat.n)} 行，new_id ${Number(mapStat.mn)}..${Number(mapStat.mx)}`);
if (Number(mapStat.n) !== Number(srcStat.total)) fail("映射行数与源表行数不一致");

// ── 3. 全量回填（列清单由 information_schema 动态生成，杜绝手写漏列）──
const colList = COLS.map((c) => `\`${c}\``).join(", ");
const colSelect = COLS.map((c) => `u.\`${c}\``).join(", ");
await pool.query(
  `INSERT INTO ${NEW_TABLE} (id, ${colList})
   SELECT m.new_id, ${colSelect}
     FROM crm_users u JOIN ${MAP_TABLE} m ON m.old_id = u.id
    ORDER BY u.id`,
);
const [[newStat]] = await pool.query(
  `SELECT COUNT(*) total, MIN(id) min_id, MAX(id) max_id, COUNT(DISTINCT id) dis FROM ${NEW_TABLE}`,
);
console.log(`[3] 回填完成：行数=${Number(newStat.total)} id=${Number(newStat.min_id)}..${Number(newStat.max_id)} 去重后=${Number(newStat.dis)}`);

// ── 4. 校验（不通过就报错退出）──
// 4.1 id 必须 1..N 连续
if (Number(newStat.min_id) !== 1) fail(`id 未从 1 起始（实际 min=${newStat.min_id}）`);
if (Number(newStat.max_id) !== Number(newStat.total)) fail(`id 不连续（max=${newStat.max_id} 行数=${newStat.total}）`);
if (Number(newStat.dis) !== Number(newStat.total)) fail("id 存在重复");

// 4.2 逐列 NULL-safe 全等比对（旧行 vs 其映射新行；已退役列不在比对范围）
const cmpCond = COLS.map((c) => `NOT (u.\`${c}\` <=> n.\`${c}\`)`).join(" OR ");
const [[mismatch]] = await pool.query(
  `SELECT COUNT(*) bad
     FROM crm_users u
     JOIN ${MAP_TABLE} m ON m.old_id = u.id
     JOIN ${NEW_TABLE} n ON n.id = m.new_id
    WHERE ${cmpCond}`,
);
if (Number(mismatch.bad) !== 0) fail(`有 ${mismatch.bad} 行逐列比对不一致，影子表数据不可信`);
console.log(`[4] 校验通过：id 连续 1..${Number(newStat.total)}，${COLS.length} 个保留列逐行 NULL-safe 全等（0 差异）`);

// 4.3 自增值应为 N+1
const [[ai]] = await pool.query(
  `SELECT AUTO_INCREMENT ai FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?`,
  [env.DB_NAME, NEW_TABLE],
);
console.log(`[4] 新表 AUTO_INCREMENT=${Number(ai.ai)}（预期 ${Number(newStat.total) + 1}）`);

// 4.4 下游引用量复核（阶段二需要改写的存量，按映射换算后应保持一致）
const [downstream] = await pool.query(
  `SELECT c.TABLE_NAME, c.COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS c
    WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME <> 'crm_users'
      AND (c.COLUMN_NAME LIKE '%user_id' OR c.COLUMN_NAME LIKE '%uid'
           OR c.COLUMN_NAME IN ('customer_id','user_key'))
      AND c.DATA_TYPE IN ('bigint','int','mediumint','smallint','tinyint')
    ORDER BY c.TABLE_NAME`,
  [env.DB_NAME],
);
console.log(`\n[5] 阶段二待办：全库共 ${downstream.length} 个候选用户指向列，需按 ${MAP_TABLE} 逐列级联改写：`);
for (const d of downstream) console.log(`      ${d.TABLE_NAME}.${d.COLUMN_NAME}`);

console.log(`\n✅ 阶段一完成。${NEW_TABLE}（id 1..${Number(newStat.total)}）与 ${MAP_TABLE} 已就绪，crm_users 未做任何改动。`);
console.log(`   下一步（阶段二，需人工闸口 + 停机冻结写者）：用 ${MAP_TABLE} 级联改写上述列 → 原子 RENAME 切换。`);
await pool.end();
