/**
 * crm_benefit_catalog 影子表 · 阶段二（切换上线，方案 §4 / ADR-0003）
 *
 * 阶段二只做一件事：把 6 列影子表换成正式名。
 *   RENAME TABLE crm_benefit_catalog TO crm_benefit_catalog__old_<日期>,
 *                crm_benefit_catalog__new TO crm_benefit_catalog;
 * 几秒完成，回滚就是反向改名。
 *
 * ⚠️ 必须重建外键（2026-09-29 沙盘实测，方案 §3.4 分支③）：
 *   FOREIGN_KEY_CHECKS=0 下 rename 被引用父表**不报错**，但 3 张子表的外键会跟随改名，
 *   永远指向 crm_benefit_catalog__old_<日期>。不重建的话，将来任何人 DROP 那张备份表
 *   都会报 "Cannot delete the parent table"——这是最典型的"切换当时一切正常、几周后炸"。
 *   本脚本不猜：切换前从 INFORMATION_SCHEMA 读出 3 个外键的真实定义，rename 后原样 ADD 回来。
 *
 * 硬闸（任一不过即拒绝执行，默认 dry-run 只读）：
 *   G1 本仓源码已不再引用退役列（=「发布 A」已落地）
 *   G2 影子表存在、列集正确、行数 ≥ 主表
 *   G3 保留列逐行比对：主表 vs 影子表必须完全一致（不一致先跑阶段一补增量）
 *   G4 迁移账本已含 105 与 106（防止与并发的 crm_benefit_quotas 重建互相踩外键）
 *   G5 主表 sort_order 全局唯一（否则新表 uk_benefit_sort 建不成/行序会抖）
 *   G6 三张子表的外键定义可读且各只有一条指向主表
 *
 * 用法：
 *   node scripts/benefit-catalog-shadow-phase2-cutover.mjs                       # 只读预检
 *   node scripts/benefit-catalog-shadow-phase2-cutover.mjs --execute --confirm CUTOVER
 *   node scripts/benefit-catalog-shadow-phase2-cutover.mjs --rollback --confirm ROLLBACK
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { RETIRED_COLUMNS } from "./lib/benefit-catalog-sort-map.mjs";

const EXECUTE = process.argv.includes("--execute");
const ROLLBACK = process.argv.includes("--rollback");
const CONFIRM = process.argv.includes("--confirm") ? process.argv[process.argv.indexOf("--confirm") + 1] : "";

const MAIN = "crm_benefit_catalog";
const NEW = `${MAIN}__new`;
const DAY = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const OLD = `${MAIN}__old_${DAY}`;
/** 6 列终态的列集（多一列少一列都是闸口不通过） */
const NEEDED = ["benefit_code", "name_zh", "value_kind", "level_dict", "sort_order", "created_at"];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const L = [];
const log = (s = "") => {
  L.push(s);
  console.log(s);
};
function logFile() {
  try {
    const outDir = path.join(__dirname, "out");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `benefit-catalog-shadow-phase2-${ROLLBACK ? "rollback" : EXECUTE ? "cutover" : "dryrun"}.log`), L.join("\n") + "\n", "utf8");
  } catch { /* 落盘失败不掩盖真实原因 */ }
}
const blockers = [];
function stop(msg, code = 1) {
  logFile();
  if (code !== 0) {
    console.error(`\n[FATAL] ${msg}`);
    process.exit(code);
  }
  console.log(`\n[DONE] ${msg}`);
}
process.on("uncaughtException", (e) => stop(`未捕获异常：${e?.stack || e}`));
process.on("unhandledRejection", (e) => stop(`未处理拒绝：${e?.stack || e}`));

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(__dirname, "..", ".env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^DB_[A-Z_]+=/ && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "").trim()]),
);
const pool = await mysql.createPool({
  host: env.DB_HOST,
  port: Number(env.DB_PORT),
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  charset: "utf8mb4",
  connectionLimit: 2,
});
const q = async (sql, p) => (await pool.query(sql, p))[0];

log(`目标库：${env.DB_USER}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`);
log(`模式：${ROLLBACK ? "ROLLBACK（反向改名）" : EXECUTE ? "EXECUTE（切换）" : "DRY-RUN（只读预检）"}`);
log(`改名计划：${MAIN} → ${OLD}，${NEW} → ${MAIN}`);

// ───────────────────── 预检闸口 ─────────────────────
// G1 本仓源码不再引用退役列
// 只扫「包含 crm_benefit_catalog 的 SQL 模板串」：按行扫会把 crm_plan_catalog.is_active、
// crm_benefit_quotas.updated_at 这些**别的表**的同名列误报成本表的引用，假阳性会让人开始绕过闸口。
const srcDir = path.join(__dirname, "..", "src");
const offenders = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      walk(p);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(e.name)) continue;
    if (p.includes(`${path.sep}db${path.sep}migrations${path.sep}`)) continue; // 迁移历史文件必须保留旧列名，不算引用
    const text = fs.readFileSync(p, "utf8");
    if (!/crm_benefit_catalog/.test(text)) continue;
    for (const sql of text.match(/`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g) ?? []) {
      if (!/crm_benefit_catalog/.test(sql)) continue;
      for (const c of RETIRED_COLUMNS) {
        if (new RegExp(`\\b${c}\\b`).test(sql)) offenders.push(`${path.relative(srcDir, p)} → ${c}`);
      }
    }
  }
})(srcDir);
if (offenders.length > 0) blockers.push(`G1 「发布 A」未落地，本仓 SQL 仍读写退役列：\n     ${[...new Set(offenders)].join("\n     ")}`);
log(`[G1] 源码 SQL 对退役列的引用：${offenders.length === 0 ? "无 ✓" : `${offenders.length} 处 ✗ ${[...new Set(offenders)].join(" | ")}`}`);

// G2 影子表存在 + 列集
const newCols = (await q(`SELECT COLUMN_NAME c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${NEW}' ORDER BY ORDINAL_POSITION`)).map((r) => r.c);
if (newCols.length === 0) blockers.push(`G2 影子表 ${NEW} 不存在：先跑阶段一`);
else {
  const missing = NEEDED.filter((c) => !newCols.includes(c));
  const extra = newCols.filter((c) => !NEEDED.includes(c));
  if (missing.length) blockers.push(`G2 影子表缺必需列：${missing.join(",")}`);
  if (extra.length) blockers.push(`G2 影子表有多余列（终态应只 ${NEEDED.length} 列）：${extra.join(",")}`);
}
log(`[G2] 影子表列集：${newCols.join(", ") || "(不存在)"}`);

// 主表现状
const mainCols = (await q(`SELECT COLUMN_NAME c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${MAIN}' ORDER BY ORDINAL_POSITION`)).map((r) => r.c);
const mainRows = Number((await q(`SELECT COUNT(*) n FROM ${MAIN}`))[0].n);
const newRows = newCols.length ? Number((await q(`SELECT COUNT(*) n FROM ${NEW}`))[0].n) : -1;
log(`[G2] 行数：主表 ${mainRows} / 影子表 ${newRows}`);
if (newRows >= 0 && newRows < mainRows) blockers.push(`G2 影子表行数(${newRows}) < 主表(${mainRows})：切换窗口内主表有新增，先补增量再切`);

// G3 保留列逐行比对（以主表已启用行为准；影子表按 is_active 过滤回填，停用行本就不进新表）
// 回滚模式下主表已是 6 列结构，没有 is_active 可过滤 → 条件拼接，不能写死
const activeFilter = mainCols.includes("is_active") ? "WHERE m.is_active = 1" : "";
if (newCols.length > 0) {
  const diffs = await q(
    `SELECT m.benefit_code, m.name_zh, m.value_kind, CAST(m.level_dict AS CHAR) ld, m.sort_order
       FROM \`${MAIN}\` m ${activeFilter}`,
  );
  const news = await q(`SELECT benefit_code, name_zh, value_kind, CAST(level_dict AS CHAR) ld, sort_order FROM \`${NEW}\``);
  const nmap = Object.fromEntries(news.map((r) => [r.benefit_code, r]));
  const bad = diffs.filter((m) => {
    const n = nmap[m.benefit_code];
    if (!n) return true;
    return n.name_zh !== m.name_zh || n.value_kind !== m.value_kind || String(n.ld ?? "") !== String(m.ld ?? "") || Number(n.sort_order) !== Number(m.sort_order);
  });
  log(`[G3] 保留列逐行比对：${diffs.length} 行，不符 ${bad.length} 行${bad.length ? ` ✗（${bad.slice(0, 5).map((b) => b.benefit_code).join(",")}）` : " ✓"}`);
  if (bad.length > 0) blockers.push(`G3 有 ${bad.length} 行数据不一致，禁止切换：先跑阶段一补增量（同脚本复跑 --apply）`);
  const onlyInNew = news.filter((n) => !diffs.find((m) => m.benefit_code === n.benefit_code));
  if (onlyInNew.length > 0) log(`  ⚠️ 影子表独有 ${onlyInNew.length} 行（主表已删/已停用）：${onlyInNew.map((r) => r.benefit_code).join(",")}`);
}

// G4 迁移账本
const vers = (await q(`SELECT version FROM schema_migrations WHERE version IN (105,106)`)).map((r) => Number(r.version));
log(`[G4] 迁移账本 105/106：${vers.join(",") || "无"}`);
if (!vers.includes(105)) blockers.push("G4 迁移 105（crm_benefit_quotas 重建）尚未登记：现在切换，等它跑起来会重建子表并撞上本脚本重建的外键，两边互相踩。等它上线后再切");
if (!vers.includes(106)) blockers.push("G4 迁移 106（主表 sort_order 重编号）尚未登记：代码与库的顺序事实源不一致，先跑 scripts/benefit-catalog-renumber-main.mjs --apply");

// G5 主表 sort_order 唯一
const dupMain = mainCols.includes("is_active")
  ? await q(`SELECT sort_order, COUNT(*) n FROM ${MAIN} WHERE is_active=1 GROUP BY sort_order HAVING COUNT(*)>1`)
  : await q(`SELECT sort_order, COUNT(*) n FROM ${MAIN} GROUP BY sort_order HAVING COUNT(*)>1`);
log(`[G5] 主表 sort_order 跨组撞号：${dupMain.length === 0 ? "无 ✓" : dupMain.map((d) => `${d.sort_order}×${d.n}`).join(" ") + " ✗"}`);
if (dupMain.length > 0) blockers.push(`G5 主表 sort_order 仍不唯一（${dupMain.length} 组）：新表有 uk_benefit_sort，补增量会直接撞唯一键`);

// G5b 停用行提醒（发布 A 已撤掉 is_active 过滤，切换时该行被影子表排除）
const inactive = mainCols.includes("is_active")
  ? Number((await q(`SELECT COUNT(*) n FROM ${MAIN} WHERE is_active<>1`))[0].n)
  : 0;
log(`[G5b] 主表停用行：${inactive} 行${inactive ? ` → 切换后这 ${inactive} 个权益将从官网/门控消失，需先人工裁决（进新表 or 删矩阵格）` : " ✓"}`);

// G6 子表外键定义
const fks = await q(
  `SELECT k.TABLE_NAME t, k.CONSTRAINT_NAME n, k.COLUMN_NAME col,
          r.REFERENCED_TABLE_NAME rt, k.REFERENCED_COLUMN_NAME rcol,
          k.ORDINAL_POSITION pos,
          (SELECT DELETE_RULE FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME=k.CONSTRAINT_NAME) dr,
          (SELECT UPDATE_RULE FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME=k.CONSTRAINT_NAME) ur
     FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
     JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS r
       ON r.CONSTRAINT_SCHEMA=DATABASE() AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME
    WHERE k.TABLE_SCHEMA=DATABASE() AND r.REFERENCED_TABLE_NAME IN ('${MAIN}','${OLD}','${NEW}')
    ORDER BY k.TABLE_NAME, k.ORDINAL_POSITION`,
);
log(`[G6] 指向权益目录的外键：${fks.length} 条`);
for (const f of fks) log(`  ${f.t}.${f.col} → ${f.rt}(${f.rcol})  约束名 ${f.n}  ON DELETE=${f.dr} ON UPDATE=${f.ur}`);
if (fks.length === 0) blockers.push("G6 一条外键都没读到：要么库已异常，要么读权限不足，禁止在看不清状态时切换");

if (blockers.length > 0) {
  log(`\n闸口未过 ${blockers.length} 项：`);
  blockers.forEach((b, i) => log(`  ${i + 1}. ${b}`));
  if (!EXECUTE && !ROLLBACK) {
    stop("DRY-RUN 结束（未写库）", 0);
  }
  stop("拒绝执行：先清掉上面的闸口", 1);
}
log("\n[闸口] G1–G6 全部通过 ✓");

if (!EXECUTE && !ROLLBACK) {
  log("\n[DRY-RUN] 预检通过，未写库。真正切换需维护窗口：停 dev server、冻结 daily-sync、门户与后台双停机。");
  log("  执行：node scripts/benefit-catalog-shadow-phase2-cutover.mjs --execute --confirm CUTOVER");
  stop("dry-run 结束", 0);
}

// ───────────────────── 改名 + 重建外键 ─────────────────────
const wantConfirm = ROLLBACK ? "ROLLBACK" : "CUTOVER";
if (CONFIRM !== wantConfirm) stop(`需要显式确认：加 --confirm ${wantConfirm}（本操作改动线上表名）`);

// 回滚方向：OLD 必须存在
if (ROLLBACK) {
  const existsOld = (await q(`SELECT TABLE_NAME t FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${OLD}'`))[0];
  if (!existsOld) stop(`找不到备份表 ${OLD}，无法回滚`);
}

/** 重建语句：按切换前从库里读到的真实定义原样生成（含历史遗留的奇怪约束名） */
function rebuildSql(list) {
  return list.map((f) => {
    const cols = list.filter((x) => x.t === f.t && x.n === f.n).map((x) => `\`${x.col}\``);
    const refCols = list.filter((x) => x.t === f.t && x.n === f.n).map((x) => `\`${x.rcol}\``);
    return `ALTER TABLE \`${f.t}\` ADD CONSTRAINT \`${f.n}\` FOREIGN KEY (${cols.join(",")}) REFERENCES \`${MAIN}\` (${refCols.join(",")}) ON DELETE ${f.dr} ON UPDATE ${f.ur}`;
  });
}

const preFks = fks.filter((f) => f.rt === MAIN);
if (!ROLLBACK && preFks.length === 0) stop("切换前主表没有任何入向外键，与实测不符，先查清再切");

const conn = await pool.getConnection();
try {
  // FOREIGN_KEY_CHECKS 是 SESSION 变量：整个改名+重建必须在同一个连接上
  await conn.query("SET SESSION FOREIGN_KEY_CHECKS = 0");
  if (ROLLBACK) {
    log(`\n[1] 反向改名：${MAIN} → ${NEW}，${OLD} → ${MAIN}`);
    await conn.query(`RENAME TABLE \`${MAIN}\` TO \`${NEW}\`, \`${OLD}\` TO \`${MAIN}\``);
  } else {
    log(`\n[1] 改名：${MAIN} → ${OLD}，${NEW} → ${MAIN}`);
    await conn.query(`RENAME TABLE \`${MAIN}\` TO \`${OLD}\`, \`${NEW}\` TO \`${MAIN}\``);
  }

  // 实测分支③：子表外键跟随 rename，仍指向旧名 → 无条件重建
  const nowFks = (await conn.query(
    `SELECT k.TABLE_NAME t, k.CONSTRAINT_NAME n, k.COLUMN_NAME col, r.REFERENCED_TABLE_NAME rt, k.REFERENCED_COLUMN_NAME rcol,
            (SELECT DELETE_RULE FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME=k.CONSTRAINT_NAME) dr,
            (SELECT UPDATE_RULE FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME=k.CONSTRAINT_NAME) ur
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
       JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=DATABASE() AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME
      WHERE k.TABLE_SCHEMA=DATABASE() AND r.REFERENCED_TABLE_NAME IN ('${MAIN}','${OLD}','${NEW}')`,
  ))[0];
  const stale = nowFks.filter((f) => f.rt !== MAIN);
  log(`[2] 改名后仍指向旧表名的外键：${stale.length} 条（${stale.map((f) => f.n).join(",") || "无"}）`);
  for (const f of stale) {
    await conn.query(`ALTER TABLE \`${f.t}\` DROP FOREIGN KEY \`${f.n}\``);
  }
  const stmts = [...new Set(rebuildSql(preFks))];
  log(`[3] 重建外键 ${stmts.length} 条，使其重新指向 ${MAIN}`);
  for (const s of stmts) {
    await conn.query(s);
    log(`      ${s.replace(/ALTER TABLE /, "").slice(0, 110)}`);
  }
  await conn.query("SET SESSION FOREIGN_KEY_CHECKS = 1");
} catch (e) {
  conn.release();
  stop(`执行中断（未确认成功的部分不要手改，先跑 --rollback）：${e.message}`);
}

// ───────────────────── 切换后复核 P1–P6 ─────────────────────
log("\n[4] 切换后复核");
const after = (await conn.query(`SHOW CREATE TABLE \`${MAIN}\``))[0][0]["Create Table"];
const afterCols = (await conn.query(`SELECT COLUMN_NAME c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${MAIN}' ORDER BY ORDINAL_POSITION`))[0].map((r) => r.c);
conn.release();
const retiredStill = RETIRED_COLUMNS.filter((c) => afterCols.includes(c));
log(`  P1 新主表列集（${afterCols.length} 列）：${afterCols.join(", ")}`);
if (retiredStill.length > 0) log(`  P1 ✗ 退役列仍在：${retiredStill.join(",")}`);
else log("  P1 ✓ 6 列终态，退役列已全部消失");
log(`  P2 uk_benefit_sort 在位：${/uk_benefit_sort/.test(after) ? "✓" : "✗"}`);
log(`  P3 chk_enum_dict_v2 在位：${/chk_enum_dict_v2/.test(after) ? "✓" : "✗"}`);
const postFks = await q(
  `SELECT k.TABLE_NAME t, k.CONSTRAINT_NAME n, r.REFERENCED_TABLE_NAME rt
     FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
     JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=DATABASE() AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME
    WHERE k.TABLE_SCHEMA=DATABASE() AND r.REFERENCED_TABLE_NAME IN ('${MAIN}','${OLD}','${NEW}')`,
);
log(`  P4 外键指向汇总：${postFks.map((f) => `${f.n}→${f.rt}`).join(" ")}`);
const wrong = postFks.filter((f) => f.rt !== MAIN);
log(`  P4 ${wrong.length === 0 ? "✓ 全部指向正式表" : `✗ 有 ${wrong.length} 条仍指错表`}`);
const cnt = await q(`SELECT (SELECT COUNT(*) FROM ${MAIN}) a, (SELECT COUNT(*) FROM ${OLD}) b`);
log(`  P5 行数：正式表 ${cnt[0].a} / 备份表 ${cnt[0].b}（备份表用于回滚，保留至观察期结束）`);
const orphan = await q(
  `SELECT (SELECT COUNT(*) FROM crm_plan_benefits b LEFT JOIN ${MAIN} m ON m.benefit_code=b.benefit_code WHERE m.benefit_code IS NULL) x,
          (SELECT COUNT(*) FROM crm_benefit_quotas b LEFT JOIN ${MAIN} m ON m.benefit_code=b.benefit_code WHERE m.benefit_code IS NULL) y,
          (SELECT COUNT(*) FROM crm_service_catalog b LEFT JOIN ${MAIN} m ON m.benefit_code=b.grant_benefit_code WHERE b.grant_benefit_code IS NOT NULL AND b.grant_benefit_code<>'' AND m.benefit_code IS NULL) z`,
);
log(`  P6 子表悬空引用（矩阵/额度/服务）：${orphan[0].x} / ${orphan[0].y} / ${orphan[0].z}${Number(orphan[0].x) + Number(orphan[0].y) + Number(orphan[0].z) === 0 ? " ✓" : " ✗ 立即处理"}`);

log(`\n[5] 观察期与回滚`);
log(`  回滚（秒级）：node scripts/benefit-catalog-shadow-phase2-cutover.mjs --rollback --confirm ROLLBACK`);
log(`  备份表 ${OLD} 保留至观察期结束，再按方案 §5 决定 DROP（DROP 前必须先确认 P4 无指向）`);
log("  切换后必须回写：docs/数据库设计/crm_benefit_catalog-权益目录表.md 字段表 + §6 纪律");

stop(ROLLBACK ? "已回滚到 12 列主表" : "影子表切换完成", 0);
await pool.end();
