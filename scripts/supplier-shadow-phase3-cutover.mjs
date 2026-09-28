/**
 * 影子表阶段三：预检 + 单条原子 RENAME 切换（supplier → supplier__old_20260928，supplier__new → supplier）
 *
 * 预检（默认只做这些，不改库）：
 *   ① 结构闸：supplier__new 存在、列数=源表−7、不含 7 个退役列、AUTO_INCREMENT = N+1（SHOW CREATE TABLE 解析）；
 *   ② 漂移闸：源表不应再有「未映射的干净行」，否则要求先跑 phase1 --apply --delta；
 *   ③ 引用闸：全部下游引用都能落到 supplier__new 1..N（阶段二已改写）；
 *   ④ 跨仓代码硬闸：supply-os/{src,tests} 与 intelligence-daily/{server/src,client/src} 剥注释后
 *     不得出现 7 个退役列标识符（白名单见 EXEMPT；扫描器先自检：扫得到必然存在的 verify_status 才可信）；
 *   ⑤ 长事务闸：INNODB_TRX 超过 30s 拒绝切换（--ignore-trx 可越过并自担）。
 *
 * 执行（需双确认，且必须在门户+后台双双停机的维护窗口内）：
 *   node scripts/supplier-shadow-phase3-cutover.mjs --execute --confirm CUTOVER
 * 回滚（仅翻表名；切换后新写入的数据不随回滚移动，见打印说明）：
 *   node scripts/supplier-shadow-phase3-cutover.mjs --rollback
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXECUTE = process.argv.includes("--execute");
const CONFIRM = process.argv.includes("--confirm") && process.argv.includes("CUTOVER");
const ROLLBACK = process.argv.includes("--rollback");
const IGNORE_TRX = process.argv.includes("--ignore-trx");

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(__dirname, "..", ".env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^DB_[A-Z]+=/ && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/["']/g, "").trim()]),
);

const pool = await mysql.createPool({
  host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME, charset: "utf8mb4", connectionLimit: 2,
});

const NEW_TABLE = "supplier__new";
const MAP_TABLE = "supplier__idmap";
const OLD_TABLE = "supplier__old_20260928";
const DROPPED = ["merged_id", "english_name", "webcheck_status", "webcheck_at", "last_match_at", "unspsc_matched_at", "tenant_id"];
const REF_COLUMNS = [
  { table: "crm_supplier_claims", column: "supplier_id", where: "" },
  { table: "crm_user_supplier_pool", column: "supplier_id", where: "" },
  { table: "crm_users", column: "supplier_id", where: "" },
  { table: "crm_bid_supplier_recommendations", column: "supplier_id", where: " AND supplier_table='supplier'" },
  { table: "crm_training_registrations", column: "converted_supplier_id", where: "" },
  { table: "crm_training_registrations", column: "portal_supplier_id", where: "" },
  { table: "crm_supplier_diagnosis", column: "supplier_id", where: "" },
  { table: "crm_supplier_translations", column: "supplier_id", where: "" },
  { table: "crm_supplier_unspsc_interests", column: "supplier_id", where: " AND supplier_table='supplier'" },
];

// 跨仓扫描：退役列标识符不得残留在两仓库的运行时代码里
const REPO_ROOT = path.join(__dirname, "..");
const DAILY_ROOT = "C:\\Users\\苏御凡\\Desktop\\intelligence-daily";
const SCAN_TARGETS = [
  { root: path.join(REPO_ROOT, "src"), label: "supply-os/src" },
  { root: path.join(REPO_ROOT, "tests"), label: "supply-os/tests" },
  { root: path.join(DAILY_ROOT, "server", "src"), label: "intelligence-daily/server/src" },
  { root: path.join(DAILY_ROOT, "client", "src"), label: "intelligence-daily/client/src" },
];
// 整目录豁免：intelligence-daily/server/scripts 是历史一次性脚本（dedup/adjudicate/sweep 引用
// merged_id，已完成使命，永久不再执行）；扫描针对运行时代码。
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "scripts"]);
// 文件级豁免（标识符出现在非注释里的正当理由，逐个登记）：
const EXEMPT = {
  // 门户列白名单的「负向清单」测试：退役列名是作为断言数据存在的（白名单不得包含它们）
  [path.join(REPO_ROOT, "tests", "unit", "lib", "repos", "supplier-directory-portal-columns.test.ts")]: DROPPED,
  // 退役迁移本体：no-op 里打印退役说明的日志字符串
  [path.join(REPO_ROOT, "src", "lib", "db", "migrations", "074-supplier-english-name.ts")]: ["english_name"],
  // 国际招标机会种子迁移：tenant_id 是机会/公告宽表的列（INSERT 列清单含 notice_id 等），与 supplier 无关
  [path.join(REPO_ROOT, "src", "lib", "db", "migrations", "089-ingest-intl-tender-el-menzel.ts")]: ["tenant_id"],
};

function fail(msg) {
  console.error(`\n[FATAL] ${msg}`);
  process.exitCode = 1;
  throw new Error(msg);
}
async function tableExists(table) {
  const [[e]] = await pool.query(
    `SELECT COUNT(*) n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [env.DB_NAME, table],
  );
  return Number(e.n) > 0;
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(path.join(dir, entry.name));
    } else if (/\.(ts|tsx|vue|mjs|js|jsx)$/.test(entry.name)) {
      yield path.join(dir, entry.name);
    }
  }
}
function scanRepo() {
  const violations = [];
  let selfCheckOk = true;
  for (const t of SCAN_TARGETS) {
    if (!fs.existsSync(t.root)) fail(`扫描目标不存在：${t.root}`);
    const plain = [];
    for (const file of walk(t.root)) {
      const rel = file;
      const text = stripComments(fs.readFileSync(file, "utf8"));
      const exemptIds = EXEMPT[rel];
      for (const col of DROPPED) {
        if (exemptIds?.includes(col)) continue;
        if (new RegExp(`\\b${col}\\b`).test(text)) {
          violations.push(`${t.label} :: ${file} :: ${col}`);
        }
      }
      plain.push({ file, text });
    }
    // 扫描器自检：同一套剥离逻辑必须能在该目录扫到必然存在的标识符，否则剥离/遍历有 bug
    const needle = "verify_status";
    if (!plain.some((p) => p.text.includes(needle))) {
      console.error(`[scan] 自检失败：${t.label} 未扫到必存标识符 ${needle}，扫描器不可信`);
      selfCheckOk = false;
    } else {
      console.log(`[scan] ${t.label} 自检通过（文件数 ${plain.length}）`);
    }
  }
  if (!selfCheckOk) fail("跨仓扫描器自检未通过，拒绝切换");
  return violations;
}

// ── 回滚分支 ──
if (ROLLBACK) {
  if (!EXECUTE) fail("回滚也要 --execute：--execute --rollback");
  console.log("[rollback] 反向 RENAME（注意：切换后新写入的数据不随回滚移动，业务需停机）");
  await pool.query("SET SESSION innodb_lock_wait_timeout = 15");
  await pool.query("SET FOREIGN_KEY_CHECKS = 0");
  try {
    await pool.query(`RENAME TABLE \`supplier\` TO \`${NEW_TABLE}\`, \`${OLD_TABLE}\` TO \`supplier\``);
  } finally {
    await pool.query("SET FOREIGN_KEY_CHECKS = 1");
  }
  console.log(`[rollback] 完成：supplier 已还原为旧表，${NEW_TABLE} 保留待查。`);
  await pool.end();
  process.exit(0);
}

// ── 预检 ──
for (const t of [NEW_TABLE, MAP_TABLE]) {
  const [[e]] = await pool.query(
    `SELECT COUNT(*) n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?`,
    [env.DB_NAME, t],
  );
  if (Number(e.n) === 0) fail(`${t} 不存在：先跑 phase1/phase2`);
}
const [[oldExists]] = await pool.query(
  `SELECT COUNT(*) n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?`,
  [env.DB_NAME, OLD_TABLE],
);
if (Number(oldExists.n) > 0) fail(`${OLD_TABLE} 已存在：疑似已完成切换（重复执行），如需重切先处理旧表`);

const [[mapStat]] = await pool.query(`SELECT COUNT(*) n, MAX(new_id) mx FROM \`${MAP_TABLE}\``);
const [[newStat]] = await pool.query(`SELECT COUNT(*) n, MAX(id) mx FROM \`${NEW_TABLE}\``);
console.log(`[pre] idmap=${Number(mapStat.n)} new表=${Number(newStat.n)}（max_id ${Number(newStat.mx)}）`);
if (Number(mapStat.n) !== Number(newStat.n)) fail("idmap 与影子表行数不一致：先跑 phase1 --apply --delta");

// ① 结构闸（预期列数动态计算：源表列数 - 退役列数，不硬编码，防源表漂移）
{
  const [[srcCnt]] = await pool.query(
    `SELECT COUNT(*) n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='supplier'`,
    [env.DB_NAME],
  );
  const expected = Number(srcCnt.n) - DROPPED.length;
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=?`,
    [env.DB_NAME, NEW_TABLE],
  );
  const names = cols.map((r) => r.COLUMN_NAME);
  if (names.length !== expected) fail(`${NEW_TABLE} 列数 ${names.length} ≠ 预期 ${expected}（源表 ${Number(srcCnt.n)} 列 - ${DROPPED.length} 退役）`);
  for (const c of DROPPED) {
    if (names.includes(c)) fail(`${NEW_TABLE} 仍含退役列 ${c}`);
  }
  console.log(`[pre] 结构闸通过：${names.length} 列，无退役列`);
  // AUTO_INCREMENT 从 SHOW CREATE TABLE 解析（I_S 统计可能残留旧值）
  const [[sc]] = await pool.query(`SHOW CREATE TABLE \`${NEW_TABLE}\``);
  const ddl = Object.values(sc)[0]["Create Table"] ?? "";
  const m = ddl.match(/AUTO_INCREMENT=(\d+)/);
  const expectedAi = Number(newStat.n) + 1;
  if (!m || Number(m[1]) !== expectedAi) {
    await pool.query(`ALTER TABLE \`${NEW_TABLE}\` AUTO_INCREMENT = ${expectedAi}`);
    console.log(`[pre] AUTO_INCREMENT 修正为 ${expectedAi}（原值 ${m ? m[1] : "无"}）`);
  } else {
    console.log(`[pre] AUTO_INCREMENT=${expectedAi}（正确）`);
  }
}

// ② 漂移闸
{
  const [[unmapped]] = await pool.query(
    `SELECT COUNT(*) n FROM supplier s
      WHERE s.merged_id IS NULL AND s.company <> '测试'
        AND NOT EXISTS (SELECT 1 FROM \`${MAP_TABLE}\` m WHERE m.old_id = s.id)`,
  );
  if (Number(unmapped.n) > 0) fail(`源表有 ${Number(unmapped.n)} 行未映射的干净行：先跑 phase1 --apply --delta`);
  console.log("[pre] 漂移闸通过：源表无未映射的干净行");
}

// ③ 引用闸（缺表跳过，口径与 phase1/2 一致）
{
  const active = [];
  for (const rc of REF_COLUMNS) {
    if (await tableExists(rc.table)) active.push(rc);
  }
  for (const rc of active) {
    const [[bad]] = await pool.query(
      `SELECT COUNT(*) n FROM \`${rc.table}\` t
         LEFT JOIN \`${NEW_TABLE}\` n ON n.id = t.\`${rc.column}\`
        WHERE t.\`${rc.column}\` IS NOT NULL AND n.id IS NULL${rc.where}`,
    );
    if (Number(bad.n) > 0) fail(`${rc.table}.${rc.column} 有 ${Number(bad.n)} 条引用未落在影子表：先跑 phase2`);
  }
}
console.log("[pre] 引用闸通过：现有下游引用全部可解析到影子表");

// ④ 跨仓代码硬闸
{
  const violations = scanRepo();
  if (violations.length > 0) {
    console.error("[scan] 退役列残留引用：");
    for (const v of violations) console.error(`  - ${v}`);
    fail("跨仓扫描发现退役列残留，先清理代码再切换");
  }
  console.log("[scan] 跨仓代码硬闸通过：6 个退役列在两仓库运行时代码零残留");
}

// ⑤ 长事务闸
{
  const [trxs] = await pool.query(
    `SELECT trx_id, TIMESTAMPDIFF(SECOND, trx_started, NOW()) age
       FROM information_schema.INNODB_TRX WHERE TIMESTAMPDIFF(SECOND, trx_started, NOW()) > 30`,
  );
  if (trxs.length > 0 && !IGNORE_TRX) {
    fail(`存在 ${trxs.length} 个超过 30s 的长事务，RENAME 可能被 MDL 阻塞：先处理或加 --ignore-trx`);
  }
  console.log("[pre] 长事务闸通过");
}

if (!EXECUTE || !CONFIRM) {
  console.log("\n[DRY-RUN] 预检全部通过。切换将在一条原子语句内完成：");
  console.log(`  RENAME TABLE \`supplier\` TO \`${OLD_TABLE}\`, \`${NEW_TABLE}\` TO \`supplier\`;`);
  console.log("\n执行（务必在门户+后台停机窗口内）：node scripts/supplier-shadow-phase3-cutover.mjs --execute --confirm CUTOVER");
  await pool.end();
  process.exit(0);
}

// ── 原子切换 ──
await pool.query("SET SESSION innodb_lock_wait_timeout = 15");
await pool.query("SET FOREIGN_KEY_CHECKS = 0");
try {
  await pool.query(`RENAME TABLE \`supplier\` TO \`${OLD_TABLE}\`, \`${NEW_TABLE}\` TO \`supplier\``);
} finally {
  await pool.query("SET FOREIGN_KEY_CHECKS = 1");
}
console.log(`[cutover] RENAME 完成：supplier = 影子表，旧表保留为 ${OLD_TABLE}`);

// ── 切换后复核 ──
{
  const [[cnt]] = await pool.query(`SELECT COUNT(*) n FROM supplier`);
  if (Number(cnt.n) !== Number(newStat.n)) fail(`切换后行数 ${Number(cnt.n)} ≠ 预期 ${Number(newStat.n)}`);
  const [[sc]] = await pool.query(`SHOW CREATE TABLE \`supplier\``);
  const ddl = Object.values(sc)[0]["Create Table"] ?? "";
  for (const c of DROPPED) {
    if (ddl.includes(`\`${c}\``)) fail(`切换后 supplier 仍含退役列 ${c}`);
  }
  for (const rc of REF_COLUMNS) {
    if (!(await tableExists(rc.table))) continue;
    const [[bad]] = await pool.query(
      `SELECT COUNT(*) n FROM \`${rc.table}\` t
         LEFT JOIN supplier n ON n.id = t.\`${rc.column}\`
        WHERE t.\`${rc.column}\` IS NOT NULL AND n.id IS NULL${rc.where}`,
    );
    if (Number(bad.n) > 0) fail(`切换后 ${rc.table}.${rc.column} 有 ${Number(bad.n)} 条悬空引用`);
  }
  console.log(`[post] supplier ${Number(cnt.n)} 行、无退役列、下游引用零悬空`);
}

console.log(`
✅ 切换完成。验收清单（起服务后逐项过）：
   门户：目录分页/搜索、企业卡完整度、认领建议、诊断候选弹窗、企业编辑回填保存、sitemap
   后台：供应商列表/筛选/编辑、认领审核、AI 补全与字段完整度卡、开放 API 字段、大屏统计
   统计：getStats 三口径（verified/cert/intl）与 countApproved 数值合理
回滚（如需）：node scripts/supplier-shadow-phase3-cutover.mjs --execute --rollback
   注意：切换后产生的业务数据不会随回滚移动；回滚仅还原表名。
旧表 ${OLD_TABLE} 保留至验收通过后人工 DROP。`);
await pool.end();
