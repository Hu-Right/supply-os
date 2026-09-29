/**
 * 主表 sort_order 重编号为全局唯一（阶段一 → 「发布 A」之间的解耦步骤，方案 §1.2）
 *
 * 为什么必须先做这一步：代码要从 `ORDER BY group_code, sort_order` 改成 `ORDER BY sort_order`
 * （切表后没有 group_code 了），而主表现状 sort_order 跨组撞号（60、130 各重复一次）。
 * 不改主表就改代码 → 官网行序立刻变；先改主表 → 两种写法逐行同序，代码发布与切表彻底解耦。
 *
 * 编号用公式而不是硬编码清单：`ROW_NUMBER() OVER (ORDER BY group_code, sort_order, benefit_code) * 10`
 * 数学上保证「重编号后的 sort_order 序 ≡ 重编号前的 (group_code, sort_order) 序」，
 * 与库里有多少行、将来新增哪一行都无关，不会因为映射表过期而静默改官网顺序。
 * lib/benefit-catalog-sort-map.mjs 里的 §1.2 映射表在此只作**核对**用，不作赋值来源。
 *
 * 安全性：15 行纯数据 UPDATE，事务 + affectedRows + 回读三重校验；
 *        执行前把原值快照到 scripts/backups/，--rollback 从最近一次快照逐行还原。
 *
 * 用法：
 *   node scripts/benefit-catalog-renumber-main.mjs                 # dry-run：只读，打印前后对照与断言
 *   node scripts/benefit-catalog-renumber-main.mjs --apply         # 事务内 UPDATE + 记账 schema_migrations(106)
 *   node scripts/benefit-catalog-renumber-main.mjs --apply --rollback
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { BENEFIT_SORT_MAP } from "./lib/benefit-catalog-sort-map.mjs";

const APPLY = process.argv.includes("--apply");
const ROLLBACK = process.argv.includes("--rollback");
const SRC = "crm_benefit_catalog";
const MIGRATION = { version: 106, name: "benefit-catalog-sort-order-unique" };

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
    fs.writeFileSync(
      path.join(outDir, `benefit-catalog-renumber${ROLLBACK ? "-rollback" : APPLY ? "-apply" : "-dryrun"}.log`),
      L.join("\n") + "\n",
      "utf8",
    );
  } catch { /* 落盘失败不掩盖真实原因 */ }
}
function stop(msg, code = 1) {
  L.push(`\n[${code === 0 ? "DONE" : "FATAL"}] ${msg}`);
  console.error(L[L.length - 1]);
  logFile();
  process.exit(code);
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

log(`目标库：${env.DB_USER}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`);
log(`模式：${ROLLBACK ? "APPLY · 回滚（从快照还原）" : APPLY ? "APPLY（写主表 + 记账 106）" : "DRY-RUN（只读）"}`);

const rows = await pool.query(
  `SELECT benefit_code, group_code, sort_order, is_active FROM ${SRC} ORDER BY group_code, sort_order, benefit_code`,
).then((r) => r[0]);
const active = rows.filter((r) => Number(r.is_active) === 1);
log(`\n[1] 主表现状：总 ${rows.length} 行 / 启用 ${active.length} 行`);

const currentOrder = active.map((r) => r.benefit_code);
const dup = Object.entries(
  active.reduce((acc, r) => ((acc[r.sort_order] = (acc[r.sort_order] ?? 0) + 1), acc), {}),
).filter(([, n]) => n > 1);
log(`  现状 sort_order 撞号：${dup.length ? dup.map(([s, n]) => `${s}×${n}`).join(" ") : "无"}`);

// ───────────────────── 回滚分支 ─────────────────────
if (ROLLBACK) {
  if (!APPLY) stop("回滚也要 --apply：--apply --rollback");
  const snapDir = path.join(__dirname, "backups");
  const snaps = fs.existsSync(snapDir) ? fs.readdirSync(snapDir).filter((f) => f.startsWith("benefit-catalog-sort-")).sort() : [];
  if (snaps.length === 0) stop("没有快照可回滚（scripts/backups/benefit-catalog-sort-*.json）");
  const snap = JSON.parse(fs.readFileSync(path.join(snapDir, snaps[snaps.length - 1]), "utf8"));
  log(`  使用快照：${snaps[snaps.length - 1]}（${snap.rows.length} 行，拍摄于 ${snap.taken_at}）`);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const r of snap.rows) {
      await conn.execute(`UPDATE ${SRC} SET sort_order = ? WHERE benefit_code = ?`, [r.sort_order, r.benefit_code]);
    }
    const [back] = await conn.query(`SELECT benefit_code, sort_order FROM ${SRC}`);
    const bad = snap.rows.filter((s) => Number(back.find((b) => b.benefit_code === s.benefit_code)?.sort_order) !== Number(s.sort_order));
    if (bad.length > 0) throw new Error(`回读不符：${bad.map((b) => b.benefit_code).join(",")}`);
    await conn.query(`DELETE FROM schema_migrations WHERE version = ?`, [MIGRATION.version]);
    await conn.commit();
    log(`  回滚完成：${snap.rows.length} 行还原，迁移账本已撤掉版本 ${MIGRATION.version}`);
  } catch (e) {
    await conn.rollback();
    conn.release();
    stop(`回滚失败，事务已撤销，数据未变：${e.message}`);
  }
  conn.release();
  stop("回滚结束", 0);
}

// ───────────────────── 目标序号（公式） ─────────────────────
const target = await pool.query(
  `SELECT benefit_code, group_code, sort_order AS old_so,
          ROW_NUMBER() OVER (ORDER BY group_code, sort_order, benefit_code) * 10 AS new_so
     FROM ${SRC}`,
).then((r) => r[0]);
const byCode = Object.fromEntries(target.map((t) => [t.benefit_code, t]));

log("\n[2] 前后对照（(group,old) → new）");
for (const t of target) {
  log(`  ${String(t.group_code).padEnd(11)} ${(t.old_so + "").padStart(4)} → ${String(t.new_so).padStart(4)}  ${t.benefit_code}`);
}

// 断言 A1：唯一性
const newVals = target.map((t) => Number(t.new_so));
if (new Set(newVals).size !== newVals.length) stop("A1 目标序号有重复，拒绝执行");
log("\n[3] 断言");
log("  A1 目标序号全局唯一 ✓");

// 断言 A2：重编号后的 sort_order 序 ≡ 重编号前的 (group_code, sort_order) 序（只看启用行）
const afterOrder = active
  .map((r) => ({ code: r.benefit_code, so: Number(byCode[r.benefit_code].new_so) }))
  .sort((a, b) => a.so - b.so)
  .map((x) => x.code);
const a2 = afterOrder.length === currentOrder.length && afterOrder.every((c, i) => c === currentOrder[i]);
log(`  A2 启用行逐行同序（旧两级排序 vs 新单列排序）：${a2 ? "✓" : "✗"}`);
if (!a2) stop(`A2 不满足，改代码会动官网行序。\n    现序：${currentOrder.join(",")}\n    新序：${afterOrder.join(",")}`);

// 断言 A3：组内相对序不变（对另一仓 `ORDER BY group_code, sort_order` 同样无损）
const groups = {};
for (const r of active) (groups[r.group_code] ??= []).push([r.benefit_code, Number(r.sort_order), Number(byCode[r.benefit_code].new_so)]);
for (const [g, list] of Object.entries(groups)) {
  const byOld = list.slice().sort((a, b) => a[1] - b[1]).map((x) => x[0]).join();
  const byNew = list.slice().sort((a, b) => a[2] - b[2]).map((x) => x[0]).join();
  if (byOld !== byNew) stop(`A3 组内相对序在 ${g} 发生变化：${byOld} → ${byNew}`);
}
log("  A3 每组组内相对序不变 ✓（另一仓的 ORDER BY group_code,sort_order 同序）");

// 断言 A4：与方案 §1.2 映射表逐行核对（过期只报警，不阻塞——赋值以公式为准）
const drift = active.filter((r) => BENEFIT_SORT_MAP[r.benefit_code] !== undefined && Number(BENEFIT_SORT_MAP[r.benefit_code]) !== Number(byCode[r.benefit_code].new_so));
const missing = active.filter((r) => BENEFIT_SORT_MAP[r.benefit_code] === undefined);
if (drift.length > 0) log(`  A4 ⚠️ 与 §1.2 映射表不符 ${drift.length} 行：${drift.map((r) => `${r.benefit_code}(${BENEFIT_SORT_MAP[r.benefit_code]}→${byCode[r.benefit_code].new_so})`).join(" ")} → 映射表需随库内顺序变化回写文档`);
else if (missing.length > 0) log(`  A4 ⚠️ 映射表未覆盖 ${missing.length} 行（新增权益）：${missing.map((r) => r.benefit_code).join(",")} → 公式已给号，但请回写 §1.2 与文档`);
else log("  A4 与 §1.2 映射表逐行一致 ✓");

if (!APPLY) {
  log("\n[DRY-RUN] 到此为止，未写主表。加 --apply 执行 UPDATE。");
  stop("dry-run 结束", 0);
}

// ───────────────────── 快照 + UPDATE ─────────────────────
const snapDir = path.join(__dirname, "backups");
fs.mkdirSync(snapDir, { recursive: true });
const snapFile = path.join(snapDir, `benefit-catalog-sort-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(snapFile, JSON.stringify({ taken_at: new Date().toISOString(), rows: rows.map((r) => ({ benefit_code: r.benefit_code, sort_order: Number(r.sort_order) })) }, null, 2), "utf8");
log(`\n[4] 原值快照：${path.relative(path.join(__dirname, ".."), snapFile)}（${rows.length} 行）`);

const conn = await pool.getConnection();
try {
  await conn.beginTransaction();
  let changed = 0;
  for (const t of target) {
    if (Number(t.old_so) === Number(t.new_so)) continue;
    const [res] = await conn.execute(`UPDATE ${SRC} SET sort_order = ? WHERE benefit_code = ?`, [t.new_so, t.benefit_code]);
    if (res.affectedRows !== 1) throw new Error(`UPDATE ${t.benefit_code} 期望影响 1 行，实际 ${res.affectedRows}`);
    changed++;
  }
  // 回读双校验：落库值必须等于目标值
  const [after] = await conn.query(`SELECT benefit_code, sort_order FROM ${SRC}`);
  const bad = target.filter((t) => Number(after.find((a) => a.benefit_code === t.benefit_code)?.sort_order) !== Number(t.new_so));
  if (bad.length > 0) throw new Error(`回读不符 ${bad.length} 行：${bad.map((b) => b.benefit_code).join(",")}`);
  // 写入后再验一次同序（真库读，不是内存算）
  const [o1] = await conn.query(`SELECT benefit_code FROM ${SRC} WHERE is_active=1 ORDER BY group_code, sort_order, benefit_code`);
  const [o2] = await conn.query(`SELECT benefit_code FROM ${SRC} WHERE is_active=1 ORDER BY sort_order, benefit_code`);
  if (o1.map((r) => r.benefit_code).join() !== o2.map((r) => r.benefit_code).join()) throw new Error("写入后两种 ORDER BY 不同序，回滚事务");

  await conn.query(
    `INSERT IGNORE INTO schema_migrations (version, name) VALUES (?, ?)`,
    [MIGRATION.version, MIGRATION.name],
  );
  await conn.commit();
  log(`  已提交：实际改动 ${changed} 行（其余原值即目标值，未动），迁移账本已记 ${MIGRATION.version}-${MIGRATION.name}`);
} catch (e) {
  await conn.rollback();
  conn.release();
  stop(`未完成，事务已回滚，数据未变：${e.message}`);
}
conn.release();

log("\n[5] 下一步（本仓代码，方案 §5「发布 A」）");
log("  listBenefits/getBenefit 去读 group_code/is_consumable/requires_subscription/gate_key 与 is_active；");
log("  ORDER BY 改 sort_order；benefit-write 的计量判据改 value_kind==='quota'。");
stop("主表 sort_order 重编号完成", 0);
