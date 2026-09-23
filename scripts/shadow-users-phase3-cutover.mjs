/**
 * 影子表阶段三（切换步）：把 crm_users__new 与 26 张已对齐副本原子换名为正式表
 *
 *   node scripts/shadow-users-phase3-cutover.mjs                 # 预检 + 打印将要执行的 SQL（不改库）
 *   node scripts/shadow-users-phase3-cutover.mjs --execute --confirm CUTOVER
 *   node scripts/shadow-users-phase3-cutover.mjs --rollback --execute --confirm ROLLBACK
 *
 * 为什么必须"停机 + 漂移校验 + 单条 RENAME"：
 *   - 副本是 phase2 那一刻的快照。之后任何一行新写入（注册、解锁、后台改权益）都会让副本过期，
 *     换名后就会丢数据或串号。故切换前先校验水位线，任何漂移一律拒绝，要求重跑 phase1+phase2。
 *   - 27 张表必须在**同一条** RENAME 语句里换名：MySQL 对该语句是原子的（要么全部生效要么全部不生效），
 *     分成两条就会出现「新 users + 旧下游」的中间态，那就是串号。
 *   - membership_tier 在影子表已退役，但活表曾有在线消费方；本步把它做成硬闸，
 *     避免换名后 supply-os 或后台报表直接 Unknown column。
 *
 * 旧表不删除，统一改名保留为 <t>__old_p3，回滚即反向 RENAME。
 */
import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";

const ARGS = process.argv.slice(2);
const DO_EXECUTE = ARGS.includes("--execute");
const DO_ROLLBACK = ARGS.includes("--rollback");
const CONFIRM = ARGS[ARGS.indexOf("--confirm") + 1] ?? "";
const ALLOW_EXT_TIER = ARGS.includes("--allow-external-tier");
const OLD_SUFFIX = "__old_p3";

const REPO_OS = process.cwd();
const REPO_ID = "C:/Users/苏御凡/Desktop/intelligence-daily";
const SKIP = /node_modules|\.next|coverage|dist[\\/]|playwright-report|test-results|\.git|runtime|[\\/]bin[\\/]|logs|public|uploads/;

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/)
    .filter((l) => /^DB_[A-Z]+=/ && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/["']/g, "").trim()]),
);
const pool = await mysql.createPool({
  host: env.DB_HOST, port: +env.DB_PORT, user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME, charset: "utf8mb4", connectionLimit: 2,
});
const DB = env.DB_NAME;
const STATE = "crm_users__cutover_state";
const AUDIT = "crm_users__orphan_audit";

/** 必改 26 列（与 phase2 一致）；换名只需表级去重 */
const MUST_TABLES = [
  "crm_benefit_quotas", "crm_chat_sessions", "crm_consent_log", "crm_learning_material_purchases",
  "crm_notice_ai_summaries", "crm_notice_favorites", "crm_notice_interests", "crm_opportunity_unlocks",
  "crm_password_resets", "crm_payment_orders", "crm_plan_subscriptions", "crm_reco_weight_profile",
  "crm_refresh_tokens", "crm_service_orders", "crm_subscription_seats", "crm_supplier_claims",
  "crm_supplier_qualification", "crm_user_industry_prefs", "crm_user_interest_codes", "crm_user_llm_config",
  "crm_user_notice_views", "crm_user_reco_feedback", "crm_user_search_log", "crm_user_supplier_pool",
  "learning_orders", "training_orders",
];
/** 本次退役的三列（membership_tier 另设硬闸，另两列要求本仓零残留） */
const RETIRED = ["nickname_source", "qualification_id", "membership_tier"];
const SWAP = ["crm_users", ...MUST_TABLES]; // 27 张

function die(msg) { console.error(`\n❌ 拒绝执行：${msg}`); process.exit(1); }
const notes = [];
function warn(msg) { notes.push(msg); console.log(`   ⚠ ${msg}`); }

async function tableExists(t) {
  const [r] = await pool.query(
    `SELECT COUNT(*) n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?`, [DB, t]);
  return Number(r[0].n) > 0;
}
async function colsOf(t) {
  const [r] = await pool.query(
    `SELECT COLUMN_NAME c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`,
    [DB, t]);
  return r.map((x) => x.c);
}
async function count(t) { return Number((await pool.query(`SELECT COUNT(*) n FROM \`${t}\``))[0][0].n); }
async function stateVal(k) {
  const [r] = await pool.query(`SELECT v FROM \`${STATE}\` WHERE k=?`, [k]);
  return r.length ? String(r[0].v) : null;
}

/** 扫描源码是否仍引用某列；excl 为路径片段黑名单 */
/** 剖去注释行与行尾注释，只留可执行代码——否则退役说明注释会把闸门误报成“仍在引用” */
function stripComments(s) {
  return s
    .split(/\r?\n/)
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .map((l) => l.replace(/\/\/[^"'`]*$/, ""))
    .join("\n");
}

/** 精确查：是否存在**直接对 crm_users 操作该列**的 SQL（同文件共现太粗，会把别的表同名列误报）*/
function scanUsersColSql(root, relDir, col, excl = []) {
  const re = new RegExp(
    `\\bUPDATE\\s+crm_users\\b[\\s\\S]{0,300}?\\b${col}\\b` +
      `|\\bSELECT\\b[\\s\\S]{0,400}?\\b${col}\\b[\\s\\S]{0,400}?\\bFROM\\s+crm_users\\b` +
      `|\\bINSERT\\s+INTO\\s+crm_users\\s*\\([^)]*\\b${col}\\b`,
    "i",
  );
  const out = [];
  const dir = path.join(root, relDir);
  if (!fs.existsSync(dir)) return out;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (SKIP.test(p)) continue;
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx|js|jsx|mjs|cjs|vue)$/.test(e.name)) continue;
      const norm = p.split(path.sep).join("/");
      if (excl.some((x) => norm.includes(x))) continue;
      let s; try { s = fs.readFileSync(p, "utf8"); } catch { continue; }
      if (re.test(stripComments(s))) out.push(path.relative(root, p).replace(/\\/g, "/"));
    }
  })(dir);
  return out;
}

function scanRefs(root, relDir, token, excl = [], alsoRequire = null) {
  const out = [];
  const dir = path.join(root, relDir);
  if (!fs.existsSync(dir)) return out;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (SKIP.test(p)) continue;
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx|js|jsx|mjs|cjs|vue)$/.test(e.name)) continue;
      // Windows 下 path.join 产出反斜杠，统一成正斜杠再比黑名单，否则 exclude 永不命中
      const norm = p.split(path.sep).join("/");
      if (excl.some((x) => norm.includes(x))) continue;
      let s; try { s = fs.readFileSync(p, "utf8"); } catch { continue; }
      const code = stripComments(s);
      if (!code.includes(token)) continue;
      // 退役列闸门的真实意图是“是否还在对 crm_users 做 SQL”：
      // 许多同名标识属于别的表（crm_user_supplier_pool.qualification_id）或接口字段名，必须排除。
      if (alsoRequire && !code.includes(alsoRequire)) continue;
      out.push(path.relative(root, p).replace(/\\/g, "/"));
    }
  })(dir);
  return out;
}

// ══════════ 回滚模式 ══════════
if (DO_ROLLBACK) {
  if (!(await tableExists(STATE))) die(`状态表 ${STATE} 不存在，无从判断切换 occurred`);
  if ((await stateVal("phase")) !== "switched") die(`phase=${await stateVal("phase")}，当前并非"已切换"态，无需回滚`);
  if (CONFIRM !== "ROLLBACK") die("回滚需显式确认：--confirm ROLLBACK");
  const pairs = [];
  for (const t of SWAP) pairs.push([`${t}${OLD_SUFFIX}`, t]);
  for (const [o] of pairs) if (!(await tableExists(o))) die(`旧表 ${o} 不存在，无法回滚`);
  const sql = `RENAME TABLE ${pairs.map(([o, n]) => `\`${o}\` TO \`${n}\``).join(", ")}`;
  console.log(`回滚 SQL（${pairs.length} 对，单条原子）：\n${sql}\n`);
  if (!DO_EXECUTE) { console.log("（预检模式，未执行。加 --execute 才会回滚）"); await pool.end(); process.exit(0); }
  await pool.query(sql);
  await pool.query(`UPDATE ${STATE} SET v='rolled_back' WHERE k='phase'`);
  console.log("✅ 已回滚到切换前状态（影子副本仍保留，可修正后重跑）。");
  await pool.end();
  process.exit(0);
}

// ══════════ 预检 ══════════
console.log("=== 切换前预检（默认不改库）===\n");

console.log("[1] 状态与漂移");
if (!(await tableExists(STATE))) die(`状态表 ${STATE} 不存在——请先跑 phase1 + phase2-align 落水位线`);
const phase = await stateVal("phase");
if (phase === "switched") die("已处于 switched 态，疑似重复切换；如需重来请先 --rollback");
if (phase !== "aligned") die(`phase=${phase}，非 aligned`);
console.log(`   phase=aligned，对齐时刻 aligned_at=${await stateVal("aligned_at")}`);
const drift = [];
for (const t of SWAP) {
  const er = await stateVal(`rows:${t}`), em = await stateVal(`maxid:${t}`);
  if (er === null) { drift.push(`${t}(无水位线)`); continue; }
  const nowR = await count(t);
  let nowM = 0;
  if ((await colsOf(t)).includes("id")) nowM = Number((await pool.query(`SELECT COALESCE(MAX(id),0) m FROM \`${t}\``))[0][0].m);
  if (String(nowR) !== er || String(nowM) !== em) drift.push(`${t} 行数 ${er}→${nowR} / MAX(id) ${em}→${nowM}`);
}
if (drift.length) {
  console.log(`   检测到 ${drift.length} 张表在对齐后发生漂移：`);
  for (const d of drift) console.log(`     · ${d}`);
  die("副本快照已过期。请（在停写状态下）重跑 phase1 与 phase2-align 吸收增量后再切换");
}
console.log(`   ✓ ${SWAP.length} 张表行数与 MAX(id) 与水位线完全一致，副本未过期`);

console.log(`\n[2] 影子副本完整性`);
for (const t of SWAP) {
  if (!(await tableExists(`${t}__new`))) die(`副本 ${t}__new 不存在`);
  if (await tableExists(`${t}${OLD_SUFFIX}`)) die(`旧名槽位 ${t}${OLD_SUFFIX} 已被占用，换名会撞车`);
}
const uc = await colsOf("crm_users__new");
for (const c of RETIRED) if (uc.includes(c)) die(`crm_users__new 仍含退役列 ${c}`);
const N = Number((await pool.query(`SELECT COUNT(*) n FROM crm_users__idmap`))[0][0].n);
const usersLive = await count("crm_users");
const usersNew = await count("crm_users__new");
if (usersNew !== N || usersLive !== N) die(`行数不闭合：crm_users=${usersLive} idmap=${N} __new=${usersNew}`);
console.log(`   ✓ 27 张副本齐备，crm_users__new 共 ${uc.length} 列（三列已退役），三方行数一致 = ${N}`);
const [[bi]] = await pool.query(
  `SELECT (SELECT COUNT(DISTINCT old_id) n FROM crm_users__idmap) d1,
          (SELECT COUNT(DISTINCT new_id) n FROM crm_users__idmap) d2,
          (SELECT MIN(new_id) n FROM crm_users__idmap) mn, (SELECT MAX(new_id) n FROM crm_users__idmap) mx`);
if (Number(bi.d1) !== N || Number(bi.d2) !== N || Number(bi.mn) !== 1 || Number(bi.mx) !== N) die("idmap 非 1..N 双射");
console.log(`   ✓ idmap 为 1..${N} 双射`);

console.log(`\n[3] membership_tier 在线残留（本仓硬闸）`);
// 自检：扫描器必须能扫到“肯定存在”的引用，否则闸门是假通过（比没有闸门更危险）
const saneOs = scanRefs(REPO_OS, "src", "crm_users", ["/db/migrations/"]);
const saneId = scanRefs(REPO_ID, "server/src", "crm_users");
console.log(`   扫描器自检：supply-os/src 命中 crm_users 的文件=${saneOs.length}，后台 server/src=${saneId.length}`);
if (saneOs.length < 5) die(`supply-os 扫描异常（仅 ${saneOs.length} 个文件引用 crm_users，预期至少 5）——闸门不可信，中止`);
if (saneId.length < 3) die(`后台仓库扫描异常（仅 ${saneId.length} 个文件引用 crm_users，预期至少 3）——目录/过滤条件有误，闸门不可信，中止`);
const osTier = scanUsersColSql(REPO_OS, "src", "membership_tier", ["/db/migrations/"]);
if (osTier.length) {
  console.log(`   supply-os 仍有 ${osTier.length} 个非迁移文件引用 membership_tier：`);
  for (const f of osTier) console.log(`     · ${f}`);
  die("换名后 crm_users 将不再有该列，这些引用会直接 Unknown column。请先去引用再切换");
}
console.log("   ✓ supply-os 业务代码零残留");
const idTier = scanUsersColSql(REPO_ID, "server/src", "membership_tier", ["/db/migrations/"]);
if (idTier.length) {
  console.log(`   后台 intelligence-daily 仍有 ${idTier.length} 个文件引用 membership_tier：`);
  for (const f of idTier.slice(0, 10)) console.log(`     · ${f}`);
  if (!ALLOW_EXT_TIER) die("后台是独立进程、不随本仓发版。请先改完并发布后台，或明确知晓后果后加 --allow-external-tier 放行");
  warn("已用 --allow-external-tier 放行后台 membership_tier 引用，切换后后台相关功能将报错，责任自负");
} else {
  console.log("   ✓ 后台也无 membership_tier 引用");
}

console.log(`\n[4] 另两列退役残留（本仓必须为零）`);
for (const c of ["nickname_source", "qualification_id"]) {
  const hits = scanUsersColSql(REPO_OS, "src", c, ["/db/migrations/"]);
  if (hits.length) { console.log(`   ${c} 仍被引用于：`); for (const f of hits) console.log(`     · ${f}`); die(`请先清除 ${c} 残留`); }
  console.log(`   ✓ ${c} 无 crm_users 侧引用`);
}
const legacy = [...scanUsersColSql(REPO_OS, "scripts", "membership_tier"), ...scanUsersColSql(REPO_OS, "scripts", "nickname_source")];
if (legacy.length) warn(`一次性运维脚本仍引用退役列（不影响线上，用前需改）：${[...new Set(legacy)].join(", ")}`);

console.log(`\n[5] 外键拓扑等价性与 RENAME 障碍`);
const swapSet = new Set(SWAP);
const [fkAll] = await pool.query(
  `SELECT kcu.TABLE_NAME child, kcu.CONSTRAINT_NAME cn, kcu.COLUMN_NAME col,
          kcu.REFERENCED_TABLE_NAME parent, kcu.REFERENCED_COLUMN_NAME pcol
     FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
    WHERE kcu.TABLE_SCHEMA=? AND kcu.REFERENCED_TABLE_NAME IS NOT NULL`,
  [DB],
);
// 将约束归一为“子|列|父(已映射到副本)|父列”，以比对原表域与副本域是否拓扑等价
const norm = (rows, toNew) => {
  const m = new Map();
  for (const f of rows) {
    const c = toNew ? `${f.child}__new` : f.child;
    if (!swapSet.has(f.child)) continue;
    if (!m.has(`${c} ${f.cn}`)) m.set(`${c} ${f.cn}`, { child: c, cols: [], parent: null, pcols: [] });
    const g = m.get(`${c} ${f.cn}`);
    g.cols.push(f.col);
    // 原表的外键指向原父表名；副本应指向映射后的名字（父在换名集内则指副本）
    g.parent = toNew ? (swapSet.has(f.parent) ? `${f.parent}__new` : f.parent) : f.parent;
    g.pcols.push(f.pcol);
  }
  return new Set([...m.values()].map((g) => `${g.child}|${g.cols.sort().join(",")}|${g.parent}|${g.pcols.sort().join(",")}`));
};
const expectSet = norm(fkAll, true);
const copyAgg = new Map();
for (const f of fkAll) {
  if (!f.child.endsWith("__new")) continue;
  const base = f.child.replace(/__new$/, "");
  if (!swapSet.has(base)) continue;
  const key = `${f.child} ${f.cn}`;
  if (!copyAgg.has(key)) copyAgg.set(key, { child: f.child, cols: [], parent: f.parent, pcols: [] });
  const g = copyAgg.get(key);
  g.cols.push(f.col); g.parent = f.parent; g.pcols.push(f.pcol);
}
const copySet = new Set([...copyAgg.values()].map((g) => `${g.child}|${g.cols.sort().join(",")}|${g.parent}|${g.pcols.sort().join(",")}`));
if (expectSet.size !== copySet.size) {
  console.log(`   原表域应有外键 ${expectSet.size} 条，副本实际 ${copySet.size} 条；差异：`);
  for (const x of expectSet) if (!copySet.has(x)) console.log(`     缺失 ${x}`);
  for (const x of copySet) if (!expectSet.has(x)) console.log(`     多余 ${x}`);
  die("副本外键拓扑与原表不等价，切换会静默丢引用完整性。请重跑 phase2（含 2.5 外键补回）");
}
console.log(`   ✓ 副本外键拓扑与原表等价（${copySet.size} 条，含父表重指向副本的处理）`);
// 入站外键：子表不在换名集内，但父表会被换名——这类约束按名字解析，
// 因此必须在关闭外键检查的会话内做单条原子 RENAME，换名后子表自动指向新表。
const inbound = fkAll.filter((f) => swapSet.has(f.parent) && !swapSet.has(f.child));
if (inbound.length) {
  console.log(`   入站外键 ${inbound.length} 条（子表不换名、父表换名），将在 FOREIGN_KEY_CHECKS=0 下换名：`);
  for (const f of inbound) console.log(`     · ${f.child}.${f.col} (${f.cn}) → ${f.parent}`);
}
const [views] = await pool.query(
  `SELECT TABLE_NAME v FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA=? AND VIEW_DEFINITION LIKE '%crm_users%'`, [DB]);
if (views.length) warn(`存在引用 crm_users 的视图，换名后其定义将失效：${views.map((x) => x.v).join(", ")}`);
const [trg] = await pool.query(
  `SELECT TRIGGER_NAME tn, EVENT_OBJECT_TABLE t FROM INFORMATION_SCHEMA.TRIGGERS WHERE EVENT_OBJECT_SCHEMA=? AND EVENT_OBJECT_TABLE IN (${SWAP.map(() => "?").join(",")})`,
  [DB, ...SWAP]);
if (trg.length) { for (const x of trg) console.log(`     · 触发器 ${x.tn} ON ${x.t}`); die("触发器绑定在表上，换名需一并处理，拒绝自动切换"); }
console.log("   ✓ 无触发器牵涉");

console.log(`\n[6] 哨兵与归档闭合`);
const [[au]] = await pool.query(`SELECT COUNT(*) n FROM ${AUDIT}`);
console.log(`   ${AUDIT} 归档 ${Number(au.n)} 条（应等于 phase2 报告的悬挂引用数 503）`);
if (Number(au.n) !== 503) warn(`归档条数 ${Number(au.n)} 与已知 503 不符——若刚重跑过 phase2 且期间有新用户，属正常，请核对后继续`);

// ══════════ 生成并（可选）执行 RENAME ══════════
const pairs = SWAP.flatMap((t) => [[t, `${t}${OLD_SUFFIX}`], [`${t}__new`, t]]);
const renameSql = `RENAME TABLE ${pairs.map(([a, b]) => `\`${a}\` TO \`${b}\``).join(",\n  ")}`;
console.log(`\n=== 将在单条语句内原子执行的换名（${pairs.length} 项 / ${SWAP.length} 张表）===`);
console.log(renameSql);

if (!DO_EXECUTE) {
  console.log(`\n（预检模式，未改库。确认停机已就位后加 --execute --confirm CUTOVER）`);
} else {
  if (CONFIRM !== "CUTOVER") die("需显式确认：--confirm CUTOVER");
  console.log(`\n>>> 执行切换…`);
  await pool.query("SET SESSION innodb_lock_wait_timeout = 15");
  // 入站外键存在（子表不换名），不关检查则 RENAME 父表会失败；单条语句本身仍是原子的
  await pool.query("SET FOREIGN_KEY_CHECKS = 0");
  try {
    await pool.query(renameSql);
  } finally {
    await pool.query("SET FOREIGN_KEY_CHECKS = 1");
  }
  await pool.query(
    `INSERT INTO ${STATE} (k, v) VALUES ('phase', 'switched'), ('switched_at', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s'))
     ON DUPLICATE KEY UPDATE v = VALUES(v)`,
  );
  console.log("✅ 换名完成。开始切换后校验…");

  const nc = await colsOf("crm_users");
  if (nc.length !== uc.length) die(`切换后 crm_users 列数 ${nc.length} ≠ 预期 ${uc.length}`);
  if (await count("crm_users") !== N) die("切换后 crm_users 行数与对齐值不符");
  const [[ai]] = await pool.query(
    `SELECT AUTO_INCREMENT ai FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME='crm_users'`, [DB]);
  if (Number(ai.ai) <= N) die(`crm_users AUTO_INCREMENT=${ai.ai} 未超过 ${N}，新注册会撞号`);
  console.log(`   ✓ crm_users：${nc.length} 列 / ${N} 行 / AUTO_INCREMENT=${Number(ai.ai)}（新用户从此起编，不会再出现空洞）`);

  // 引用完整性：切换后所有指向 crm_users 的引用必须 100% 可解析（哨兵/NULL 除外）
  let broken = 0;
  for (const [t, col] of [
    ["crm_supplier_qualification", "user_id"], ["crm_password_resets", "user_id"],
    ["crm_plan_subscriptions", "owner_user_id"], ["crm_benefit_quotas", "seat_user_id"],
    ["crm_consent_log", "user_id"], ["crm_user_interest_codes", "user_id"],
    ["crm_user_reco_feedback", "user_id"], ["crm_user_notice_views", "user_id"],
  ]) {
    const [[x]] = await pool.query(
      `SELECT COUNT(*) bad FROM \`${t}\` o
        WHERE o.\`${col}\` IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM crm_users u WHERE u.id = o.\`${col}\`)`);
    const bad = Number(x.bad);
    broken += bad;
    console.log(`   ${bad === 0 ? "✓" : "✗"} ${t}.${col} 悬空引用=${bad}`);
  }
  if (broken > 0) warn(`切换后仍有 ${broken} 条悬空引用（哨兵模式下应全为 0，请核查）`);

  // 切换后复验外键拓扑：数量与入站约束必须都落在新表上
  const [fkAfter] = await pool.query(
    `SELECT TABLE_NAME child, CONSTRAINT_NAME cn, REFERENCED_TABLE_NAME parent
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [DB],
  );
  const mine = new Set([...swapSet]);
  const outAfter = new Set(fkAfter.filter((f) => mine.has(f.child)).map((f) => `${f.child} ${f.cn}`)).size;
  const [tblsAfter] = await pool.query(
    `SELECT TABLE_NAME t FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE='BASE TABLE'`, [DB]);
  const allTableNamesAfter = new Set(tblsAfter.map((x) => x.t));
  const danglingParent = fkAfter.filter((f) => !allTableNamesAfter.has(f.parent));
  console.log(`   ✓ 切换后：域内外键 ${outAfter} 条（副本域原为 ${copySet.size} 条），指向不存在的父表的约束 ${danglingParent.length} 条`);
  if (outAfter !== copySet.size) warn(`切换后外键数 ${outAfter} 与切换前副本域 ${copySet.size} 不等，请核查`);
  if (danglingParent.length) {
    for (const f of danglingParent) console.log(`     ✗ ${f.child}.${f.cn} 指向不存在的 ${f.parent}`);
    die("存在悬空外键父表，请立即回滚");
  }

  console.log(`\n🎉 切换完成。旧表保留为 *${OLD_SUFFIX}，回滚：node scripts/shadow-users-phase3-cutover.mjs --rollback --execute --confirm ROLLBACK`);
}

if (notes.length) { console.log(`\n本次遗留告警 ${notes.length} 条：`); notes.forEach((n, i) => console.log(`  ${i + 1}. ${n}`)); }
await pool.end();
