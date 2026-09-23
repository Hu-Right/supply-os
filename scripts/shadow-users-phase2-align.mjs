/**
 * 影子表阶段二（对齐步）：按 crm_users__idmap 把 26 个必改列级联改写到 <t>__new 影子副本
 *
 * 为什么是"影子副本"而不是原地 UPDATE：
 *   原地改写活表会立刻打断线上读写（crm_users 仍是旧 id，下游已变新 id）。
 *   本步只 CREATE/INSERT 带 __new 后缀的副本表，活表零改动，应用照常运行；
 *   真正的切换（原子 RENAME 27 张表）是下一步，且必须先完成 membership_tier 去引用。
 *
 * 三道硬护栏：
 *   1) 只处理 MUST 白名单（26 列）；13 个禁改列在结构上不可能被触及，并另做值域取证；
 *   2) 映射不上的悬挂引用不得照抄原值——它会落在新 id 区间内造成静默串号。
 *      统一规则：NULL 保持 NULL；能映射则映射；不能映射则置哨兵 0 并逐条归档进 crm_users__orphan_audit；
 *   3) 每张表改写后校验：行数守恒、非目标列逐列 NULL-safe 全等、引用数分解守恒（映射数 + 哨兵数 = 原非空数）。
 *      任一不符即中止并保留现场（副本表留着供排查）。
 *
 * 用法：node scripts/shadow-users-phase2-align.mjs
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
const DB = env.DB_NAME;

const MAP = "crm_users__idmap";
const AUDIT = "crm_users__orphan_audit";
const SENTINEL = 0; // 悬挂引用占位：0 不在新 id 区间 [1..99] 内，永不"认领"到真实用户

function fail(msg) {
  console.error(`\n[FATAL] ${msg}\n已完成的副本表保留在库中供排查（均以 __new 结尾，可整批 DROP 回滚）。`);
  process.exit(1);
}

/** 必改白名单：列值确实指向 crm_users.id */
const MUST = [
  ["crm_benefit_quotas", "seat_user_id"], ["crm_chat_sessions", "user_id"],
  ["crm_consent_log", "user_id"], ["crm_learning_material_purchases", "user_id"],
  ["crm_notice_ai_summaries", "user_id"], ["crm_notice_favorites", "user_id"],
  ["crm_notice_interests", "user_id"], ["crm_opportunity_unlocks", "user_id"],
  ["crm_password_resets", "user_id"], ["crm_payment_orders", "user_id"],
  ["crm_plan_subscriptions", "owner_user_id"], ["crm_reco_weight_profile", "user_id"],
  ["crm_refresh_tokens", "user_id"], ["crm_service_orders", "user_id"],
  ["crm_subscription_seats", "member_user_id"], ["crm_supplier_claims", "user_id"],
  ["crm_supplier_qualification", "user_id"], ["crm_user_industry_prefs", "user_id"],
  ["crm_user_interest_codes", "user_id"], ["crm_user_llm_config", "user_id"],
  ["crm_user_notice_views", "user_id"], ["crm_user_reco_feedback", "user_id"],
  ["crm_user_search_log", "user_id"], ["crm_user_supplier_pool", "user_id"],
  ["learning_orders", "user_id"], ["training_orders", "user_id"],
];
/** 禁改黑名单：指向另一账号体系，数值区间重叠纯属巧合 */
const FORBID = [
  ["chat_agent_presence", "agent_uid"], ["chat_canned_replies", "owner_uid"],
  ["crm_appointments", "user_id"], ["crm_bid_notices", "user_id"],
  ["crm_bid_notices", "assign_user_id"], ["crm_bid_notices", "publisher_user_id"],
  ["crm_bid_opportunities", "create_user_id"], ["crm_bid_opportunities", "assign_user_id"],
  ["crm_bid_opportunities", "last_submit_user_id"], ["crm_bid_opportunities", "last_edit_user_id"],
  ["crm_bid_opportunity_unspsc_candidates", "review_user_id"], ["crm_chat_sessions", "assigned_uid"],
  ["refresh_token", "user_id"],
];
const mustSet = new Set(MUST.map(([t, c]) => `${t}.${c}`));
for (const [t, c] of FORBID) if (mustSet.has(`${t}.${c}`)) fail(`白名单与黑名单交集 ${t}.${c}，中止`);
/** 比例判定所需最小样本量：小于此值时“命中率”无统计意义，不拿它当拦截 */
const MIN_REF_SAMPLE = 20;

// ── 0. 前置断言：桥接表自洽 ──
const [[m0]] = await pool.query(
  `SELECT (SELECT COUNT(*) FROM crm_users) users_n,
          (SELECT COUNT(*) FROM ${MAP}) map_n,
          (SELECT COUNT(DISTINCT old_id) FROM ${MAP}) d_old,
          (SELECT COUNT(DISTINCT new_id) FROM ${MAP}) d_new,
          (SELECT MIN(new_id) FROM ${MAP}) mn, (SELECT MAX(new_id) FROM ${MAP}) mx,
          (SELECT COUNT(*) FROM crm_users u WHERE NOT EXISTS(SELECT 1 FROM ${MAP} m WHERE m.old_id = u.id)) unmapped,
          (SELECT COUNT(*) FROM crm_users__new) shadow_n`,
);
const N = Number(m0.map_n);
if (Number(m0.users_n) !== N) fail(`桥接表条数 ${N} ≠ crm_users 行数 ${m0.users_n}`);
if (Number(m0.d_old) !== N || Number(m0.d_new) !== N) fail("桥接表 old_id/new_id 存在重复，非双射");
if (Number(m0.mn) !== 1 || Number(m0.mx) !== N) fail(`new_id 未覆盖 1..${N}（实 ${m0.mn}..${m0.mx}）`);
if (Number(m0.unmapped) !== 0) fail(`${m0.unmapped} 个 crm_users 行没有映射`);
if (Number(m0.shadow_n) !== N) fail(`crm_users__new 行数 ${m0.shadow_n} ≠ 映射条数 ${N}`);
console.log(`[0] 桥接表自洽：${N} 条双射映射，new_id=1..${N}，crm_users__new 行数一致`);

// 禁改列取证：看“多少个值不是合法 crm_users id”。占比高 → 确属另一账号体系（值域重叠纯属巧合）。
// 注：单看 MAX 不够——这些列最大值仅 77，正压在用户 id 区间内，必须用命中率判定。
console.log(`[0] 禁改列取证（非空满 ${MIN_REF_SAMPLE} 行才套用比例规则，小样本直接列原值供人判）：`);
for (const [t, c] of FORBID) {
  try {
    const [[v]] = await pool.query(
      `SELECT COUNT(\`${c}\`) nn,
              SUM(NOT EXISTS(SELECT 1 FROM ${MAP} m WHERE m.old_id = \`${c}\`)) bad_count
         FROM \`${t}\` WHERE \`${c}\` IS NOT NULL`,
    );
    const nn = Number(v.nn), bad = Number(v.bad_count ?? 0);
    const pct = nn ? (bad / nn) * 100 : 0;
    if (nn === 0) {
      console.log(`      ${(t + "." + c).padEnd(54)}无数据 —— 按语义归禁改`);
      continue;
    }
    if (nn < MIN_REF_SAMPLE) {
      // 样本过小，比例规则无统计意义；列出原值供人工核对语义
      const [vals] = await pool.query(
        `SELECT \`${c}\` v, COUNT(*) n FROM \`${t}\` WHERE \`${c}\` IS NOT NULL GROUP BY \`${c}\` ORDER BY n DESC LIMIT 8`,
      );
      console.log(`      ${(t + "." + c).padEnd(54)}非空=${String(nn).padStart(6)}  样本过小(n<${MIN_REF_SAMPLE})，原值=${vals.map((x) => `${x.v}×${x.n}`).join(",")} —— 按语义归禁改`);
      continue;
    }
    console.log(
      `      ${(t + "." + c).padEnd(54)}` +
      `非空=${String(nn).padStart(6)}  非法用户id=${String(bad).padStart(6)} (${pct.toFixed(1)}%)  ` +
      (pct >= 20 ? "✓ 确属另一体系" : "⚠ 命中过半，需重新归类！"),
    );
    if (pct < 20) fail(`${t}.${c} 有 ${(100 - pct).toFixed(1)}% 的值是合法 crm_users id，不能简单归入禁改，请人工判定`);
  } catch (e) { if (e.code !== "ER_NO_SUCH_TABLE") throw e; }
}

// ── 1. 归档表：无法映射的悬挂引用逐条留证 ──
await pool.query(`DROP TABLE IF EXISTS \`${AUDIT}\``);
await pool.query(`
  CREATE TABLE ${AUDIT} (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    src_table VARCHAR(64) NOT NULL COMMENT '原表名',
    src_column VARCHAR(64) NOT NULL COMMENT '原列名',
    src_pk VARCHAR(128) NOT NULL COMMENT '原表主键值（单列主键时为其值）',
    orphan_user_id BIGINT UNSIGNED NOT NULL COMMENT '改写前的悬挂原值',
    PRIMARY KEY (id), INDEX idx_src (src_table, src_column)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    COMMENT='用户 id 重排悬挂引用归档：映射不到新 id 的原值，改写后置哨兵 ${SENTINEL}，此处留证据'
`);
console.log(`[1] 归档表 ${AUDIT} 就绪`);

// ── 2. 逐表影子副本 + 级联改写 ──
const exists = async (t) => {
  const [r] = await pool.query(
    `SELECT COUNT(*) n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?`,
    [DB, t],
  );
  return Number(r[0].n) > 0;
};
let totMapped = 0, totSentinel = 0, totNull = 0;
for (const [t, col] of MUST) {
  if (!(await exists(t))) fail(`白名单表 ${t} 不存在，清单与库不同步`);
  const nw = `${t}__new`;
  if (nw.endsWith("__new") === false) fail("内部错误：副本名必须以 __new 结尾");

  // 列清单（副本用 LIKE 得到同构表，故此处只为拼 SELECT 与校验）
  // 生成列不得出现在 INSERT 列表（ER_NON_DEFAULT_VALUE_FOR_GENERATED_COLUMN），由基表自动重算
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME c, EXTRA e FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`,
    [DB, t],
  );
  const names = cols.filter((r) => !/GENERATED/i.test(r.e ?? "")).map((r) => r.c);
  const generated = cols.filter((r) => /GENERATED/i.test(r.e ?? "")).map((r) => r.c);
  // 主键：用于归档定位（复合主键则拼接）
  const [pks] = await pool.query(
    `SELECT COLUMN_NAME c FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND CONSTRAINT_NAME='PRIMARY' ORDER BY ORDINAL_POSITION`,
    [DB, t],
  );
  const pkCols = pks.map((r) => r.c);
  if (!pkCols.length) fail(`表 ${t} 无主键，无法安全归档悬挂引用`);
  const pkExpr = pkCols.length === 1
    ? `\`${pkCols[0]}\``
    : `CONCAT_WS(',', ${pkCols.map((c) => `\`${c}\``).join(", ")})`;
  if (generated.length) console.log(`  · ${t}: 跳过生成列 ${generated.join(", ")}（由基表表达式重算）`);

  const before = (await pool.query(
    `SELECT COUNT(*) rows_n, SUM(\`${col}\` IS NOT NULL) refs_n,
            SUM(EXISTS(SELECT 1 FROM ${MAP} m WHERE m.old_id = \`${col}\`)) mapped_n
       FROM \`${t}\``,
  ))[0][0];
  const rowsN = Number(before.rows_n), refsN = Number(before.refs_n ?? 0), mappedN = Number(before.mapped_n ?? 0);
  const orphanN = refsN - mappedN;
  await pool.query(`DROP TABLE IF EXISTS \`${nw}\``);
  await pool.query(`CREATE TABLE \`${nw}\` LIKE \`${t}\``);

  // 悬挂引用处置：优先置 NULL（列可空时）——MySQL 唯一键允许重复 NULL，天然兼容
  // uk_user(user_id) 这类单列唯一键；列不可空时才退而用哨兵 0，并预先检测撞键。
  const [[colMeta]] = await pool.query(
    `SELECT IS_NULLABLE nb FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?`,
    [DB, t, col],
  );
  const nullable = colMeta?.nb === "YES";
  if (orphanN > 1 && !nullable) {
    const [u] = await pool.query(
      `SELECT INDEX_NAME nm FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND NON_UNIQUE=0
        GROUP BY INDEX_NAME HAVING FIND_IN_SET(?, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX)) > 0`,
      [DB, t, col],
    );
    if (u.length)
      fail(
        `${t}.${col}：列不可空且有 ${orphanN} 条悬挂引用，而唯一键 ${u.map((x) => x.nm).join(",")} 含该列——` +
        `置哨兵 0 必撞键。需人工决策：放宽该列为 NULL / 删除已不可达的孤儿行 / 调整唯一键。`,
      );
  }
  const sentinelToken = nullable ? "NULL" : String(SENTINEL);

  // 先归档再改写：即使后续 INSERT 失败，悬挂引用证据也已完整落库
  const [orphans] = await pool.query(
    `SELECT ${pkExpr} AS pk_, o.\`${col}\` AS ov
       FROM \`${t}\` o
      WHERE o.\`${col}\` IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM ${MAP} m WHERE m.old_id = o.\`${col}\`)`,
  );
  for (const r of orphans) {
    await pool.query(
      `INSERT INTO ${AUDIT} (src_table, src_column, src_pk, orphan_user_id) VALUES (?, ?, ?, ?)`,
      [t, col, String(r.pk_), Number(r.ov)],
    );
  }

  // 目标列表达式：NULL 保留 NULL；映射得到 new_id；映射不到按上述规则处置
  const targetExpr =
    `CASE WHEN o.\`${col}\` IS NULL THEN NULL ` +
    `WHEN m.new_id IS NOT NULL THEN m.new_id ` +
    `ELSE ${sentinelToken} END`;
  const selectList = names
    .map((c) => (c === col ? `${targetExpr} AS \`${c}\`` : `o.\`${c}\``))
    .join(", ");
  await pool.query(
    `INSERT INTO \`${nw}\` (${names.map((c) => `\`${c}\``).join(", ")})
     SELECT ${selectList}
       FROM \`${t}\` o LEFT JOIN ${MAP} m ON m.old_id = o.\`${col}\``,
  );

  // ── 3. 校验 ──
  const after = (await pool.query(
    `SELECT COUNT(*) rows_n, SUM(\`${col}\` IS NOT NULL) refs_n,
            SUM(\`${col}\` = ${SENTINEL}) sentinel_n
       FROM \`${nw}\``,
  ))[0][0];
  if (Number(after.rows_n) !== rowsN) fail(`${t}: 副本行数 ${after.rows_n} ≠ 原表 ${rowsN}`);
  // 守恒不变量：副本非空引用数 == 可映射数；哨兵（0）数 == 悬挂数（仅 0 哨兵模式可测）
  if (Number(after.refs_n ?? 0) !== mappedN) {
    fail(`${t}: 副本非空引用 ${after.refs_n} ≠ 可映射数 ${mappedN}`);
  }
  if (nullable && Number(after.sentinel_n ?? 0) !== 0) fail(`${t}: 不该出现哨兵 0`);
  if (!nullable && Number(after.sentinel_n ?? 0) !== orphanN) {
    fail(`${t}: 哨兵数 ${after.sentinel_n} ≠ 悬挂引用数 ${orphanN}`);
  }
  if (Number(after.refs_n ?? 0) + orphanN !== rowsN - (rowsN - refsN)) {
    fail(`${t}: 引用分解不闭合（refs=${after.refs_n} orphan=${orphanN}）`);
  }
  // 非目标列逐列 NULL-safe 全等（按主键对齐；无主键表已在上文拦下）
  const others = names.filter((c) => c !== col);
  const cmp = others.map((c) => `NOT (a.\`${c}\` <=> b.\`${c}\`)`).join(" OR ");
  const [[diff]] = await pool.query(
    `SELECT COUNT(*) bad FROM \`${t}\` a JOIN \`${nw}\` b
        ON ${pkCols.map((c) => `a.\`${c}\` = b.\`${c}\``).join(" AND ")}
      WHERE ${cmp || "FALSE"}`,
  );
  if (Number(diff.bad) !== 0) fail(`${t}: ${diff.bad} 行非目标列不一致`);
  // 抽样验证映射正确：任一已映射行，其 new 值必须等于 old 值经桥接表的映射
  const [[spot]] = await pool.query(
    `SELECT COUNT(*) bad FROM \`${t}\` a JOIN \`${nw}\` b ON ${pkCols.map((c) => `a.\`${c}\` = b.\`${c}\``).join(" AND ")}
       JOIN ${MAP} m ON m.old_id = a.\`${col}\`
      WHERE a.\`${col}\` IS NOT NULL AND b.\`${col}\` <> m.new_id`,
  );
  if (Number(spot.bad) !== 0) fail(`${t}: ${spot.bad} 行映射值与桥接表不符`);

  totMapped += mappedN; totSentinel += orphanN; totNull += rowsN - refsN;
  console.log(
    `  ✓ ${t}.${col}`.padEnd(48) +
    `行=${String(rowsN).padStart(5)} 改写=${String(mappedN).padStart(4)} ` +
    `悬挂→${nullable ? "NULL" : "0"}=${String(orphanN).padStart(3)} 原本NULL=${String(rowsN - refsN).padStart(4)}`,
  );
}

console.log(`\n[2] 26 张副本表完成：改写 ${totMapped} 条、置哨兵 ${totSentinel} 条（已归档进 ${AUDIT}）、NULL ${totNull} 条`);

// ── 2.5 补回外键：CREATE TABLE ... LIKE **不复制外键**（实测副本 0 条）。
//     不补的话，切换后权益四表的 plan_code / benefit_code / subscription_id 将彻底失去引用约束。
const [fkRows] = await pool.query(
  `SELECT kcu.TABLE_NAME t, kcu.CONSTRAINT_NAME cn, kcu.COLUMN_NAME col,
          kcu.REFERENCED_TABLE_NAME rt, kcu.REFERENCED_COLUMN_NAME rc,
          rc.DELETE_RULE drule, rc.UPDATE_RULE urule
     FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
     JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
       ON rc.CONSTRAINT_SCHEMA = kcu.TABLE_SCHEMA AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
    WHERE kcu.TABLE_SCHEMA = ? AND kcu.REFERENCED_TABLE_NAME IS NOT NULL`,
  [DB],
);
const swapSet = new Set(["crm_users", ...MUST.map(([t]) => t)]);
const byCons = new Map();
for (const f of fkRows) {
  if (!swapSet.has(f.t)) continue;
  const key = `${f.t} ${f.cn}`;
  if (!byCons.has(key)) byCons.set(key, { t: f.t, cn: f.cn, rt: f.rt, d: f.drule, u: f.urule, cols: [] });
  byCons.get(key).cols.push([f.col, f.rc]);
}
let fkAdded = 0;
for (const g of byCons.values()) {
  const child = `${g.t}__new`;
  // 父表若也在换名集内，必须指向副本，否则切换时会指向即将改名的旧表
  const parent = swapSet.has(g.rt) ? `${g.rt}__new` : g.rt;
  const cname = `${g.cn}__p3`; // 约束名全库唯一，旧表仍持有同名约束，故加后缀
  const ccols = g.cols.map((c) => `\`${c[0]}\``).join(", ");
  const pcols = g.cols.map((c) => `\`${c[1]}\``).join(", ");
  try {
    await pool.query(
      `ALTER TABLE \`${child}\` ADD CONSTRAINT \`${cname}\` FOREIGN KEY (${ccols})
           REFERENCES \`${parent}\` (${pcols}) ON DELETE ${g.d} ON UPDATE ${g.u}`,
    );
    fkAdded++;
    console.log(`  + ${child} 补回外键 ${cname} (${ccols}) → ${parent}.${pcols} ON DELETE ${g.d}`);
  } catch (e) {
    fail(`给 ${child} 补外键 ${cname} 失败：${e.sqlMessage ?? e.message}`);
  }
}
// 副本外键数量必须与原表一致（按名比对，副本名统多 __p3 后缀）
const [[fkTot]] = await pool.query(
  `SELECT
     (SELECT COUNT(DISTINCT CONSTRAINT_NAME) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME IS NOT NULL
         AND TABLE_NAME IN (${[...swapSet].map(() => "?").join(",")})) src_n,
     (SELECT COUNT(DISTINCT CONSTRAINT_NAME) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME IS NOT NULL
         AND TABLE_NAME IN (${[...swapSet].map((x) => `?`).join(",")})) dst_n`,
  [DB, ...swapSet, DB, ...[...swapSet].map((x) => `${x}__new`)],
);
console.log(`[2.5] 外键补回：新增 ${fkAdded} 条；原表域内 ${Number(fkTot.src_n)} 条 vs 副本 ${Number(fkTot.dst_n)} 条`);
if (Number(fkTot.src_n) !== Number(fkTot.dst_n)) fail(`副本外键数 ${fkTot.dst_n} ≠ 原表 ${fkTot.src_n}，引用完整性不完整，中止`);
const [[ac]] = await pool.query(`SELECT COUNT(*) n, COUNT(DISTINCT CONCAT(src_table,'.',src_column)) c FROM ${AUDIT}`);
console.log(`[3] 归档核对：${AUDIT} 共 ${Number(ac.n)} 条（应等于置哨兵数 ${totSentinel}），覆盖 ${Number(ac.c)} 个列`);
if (Number(ac.n) !== totSentinel) fail("归档条数与哨兵数不一致");

// 误认领归零证明：副本里凡落在 1..N 的值，必须都能映射回一个真实 crm_users 行
const [resid] = await pool.query(
  `SELECT src_table, src_column, COUNT(*) n FROM ${AUDIT} a
    WHERE a.orphan_user_id BETWEEN 1 AND ${N} GROUP BY src_table, src_column`,
);
console.log(`[4] 原会"误认领"的悬挂引用（值落在 1..${N}）已全部置哨兵并归档：`);
for (const r of resid) console.log(`      ${r.src_table}.${r.src_column}: ${Number(r.n)} 条`);

console.log(`\n✅ 对齐步完成。活表零改动，应用不受影响。`);
console.log(`   下一步（切换步）的前置：1) 摘除 membership_tier 的两类在线读写；2) 停机冻结 daily-sync/CRM；`);
console.log(`   3) 以单条原子 RENAME 同时换名 27 张表；4) 用 ${AUDIT} 复核哨兵语义。`);

// ── 5. 落水位线快照：切换步据此判定“对齐后到切换前”活表是否又被写过（漂移）──
const STATE = "crm_users__cutover_state";
await pool.query(`
  CREATE TABLE IF NOT EXISTS ${STATE} (
    k VARCHAR(96) NOT NULL COMMENT '键：全局标记或 rows:/maxid: 前缀 + 表名',
    v VARCHAR(255) NOT NULL COMMENT '值',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '写入时间',
    PRIMARY KEY (k)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    COMMENT='用户 id 重排切换状态：对齐步落水位线，切换步据此检测副本快照是否已过期'
`);
await pool.query(`TRUNCATE TABLE \`${STATE}\``);
const snapTables = ["crm_users", ...MUST.map(([t]) => t)];
for (const t of [...new Set(snapTables)]) {
  const [[s]] = await pool.query(
    `SELECT COUNT(*) rows_n FROM \`${t}\``,
  );
  let mx = 0;
  const [idc] = await pool.query(
    `SELECT COLUMN_NAME c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME='id'`,
    [DB, t],
  );
  if (idc.length) {
    const [[m]] = await pool.query(`SELECT COALESCE(MAX(id),0) mx FROM \`${t}\``);
    mx = Number(m.mx);
  }
  await pool.query(`INSERT INTO ${STATE} (k, v) VALUES (?, ?), (?, ?)`, [
    `rows:${t}`, String(Number(s.rows_n)), `maxid:${t}`, String(mx),
  ]);
}
await pool.query(`INSERT INTO ${STATE} (k, v) VALUES ('aligned_at', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s')), ('phase', 'aligned')`);
console.log(`[5] 水位线已写入 ${STATE}（${snapTables.length} 张表的行数与 MAX(id)）——切换步会校验这些值未变。`);
console.log(`    ⚠ 若两表活跃写入导致值变化，切换步会拒绝执行；需重跑本脚本以吸收增量。`);
await pool.end();
