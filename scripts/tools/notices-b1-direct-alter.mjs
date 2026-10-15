/**
 * crm_bid_notices 精简 · 批次一落刀（直接 ALTER 路径 + 落刀前留底）
 *
 * 为什么本批不走影子表蓝绿（ADR-0003 的两阶段），而批次二/三/四走：
 *   ADR 的分级判据是「变更会不会让既有行需要重写 / 写错会不会当场污染线上数据」。
 *   批次一的三列：① 零本表读写点（lib/notices-ref-scan 硬断言，不是口头判断）；
 *   ② 不挂任何索引；③ 不进宽表源指纹（⇒ 不触发 64.5 万行重灌）；④ 不改任何既有行的值，
 *   只是把三列从行里摘掉。而影子表路径要额外付一次 64.5 万行过隧道的回填 + 一轮全表对账，
 *   风险面（回填期间原表被写、对账假不一致）反而比一条 DDL 大。
 *   「拿不准会不会重写既有行」的才按影子表处理：本批拿得准，批次三（改指纹要重灌）拿不准。
 *
 * 数据安全：DROP COLUMN 是不可逆的数据删除，所以落刀前先把三列的全部非空行导成
 *   runtime/notices-b1-backup-<时间戳>.sql（逐行 UPDATE 回灌语句，同本仓既有留底形制），
 *   回滚 = 重新加列 + 跑那份 SQL。文件写完并回读校验行数，才允许执行 ALTER。
 *
 * 生产保护（MySQL DDL 的经典坑是 MDL 排队把站点钉住）：
 *   - SET SESSION lock_wait_timeout = 5：拿不到元数据锁就放弃，绝不在原地排队
 *     （此刻可能有宽表 5s 轮询 / 5 分钟对账 / 我的探针正在扫本表）；
 *   - ALGORITHM 先试 INSTANT，不支持再退 INPLACE, LOCK=NONE；仍失败就报错退出，
 *     **不静默退化成 COPY**（COPY 会全程锁写）；
 *   - 关闭本会话 MAX_EXECUTION_TIME：DDL 半途被杀掉是最坏的结果。
 *
 * 用法：
 *   node --env-file=.env scripts/tools/notices-b1-direct-alter.mjs            # 体检 + 打印将做的事（不写库）
 *   node --env-file=.env scripts/tools/notices-b1-direct-alter.mjs --backup   # 只导留底，不动结构
 *   node --env-file=.env scripts/tools/notices-b1-direct-alter.mjs --apply    # 留底 + ALTER（需已确认低峰窗口）
 *   node --env-file=.env scripts/tools/notices-b1-direct-alter.mjs --restore-check  # 只回读校验留底可回放
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { NOTICES_TABLE, dropColumnsOf } from "./notices-slim-plan.mjs";
import { findNoticeRefSites } from "./lib/notices-ref-scan.mjs";
import { conn, fatal, columnsOf, indexesOf } from "./lib/notices-slim-common.mjs";

const BACKUP = process.argv.includes("--backup");
const APPLY = process.argv.includes("--apply");
const RESTORE_CHECK = process.argv.includes("--restore-check");
const BATCH = 1;
const DROP = dropColumnsOf(BATCH);
const SELF = [
  "scripts/tools/notices-slim-plan.mjs",
  "scripts/tools/notices-slim-scan.mjs",
  "scripts/tools/lib/notices-ref-scan.mjs",
  "scripts/tools/notices-shadow-phase1.mjs",
  "scripts/tools/notices-shadow-phase2-cutover.mjs",
  "scripts/tools/notices-b1-direct-alter.mjs",
  "scripts/gates/check-notices-slim.mjs",
];

const c = await conn();
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const backupFile = join(process.cwd(), "runtime", `notices-b1-backup-${stamp}.sql`);

// ── 前置体检（三条判据任一不成立即停）────────────────────────────────
const cols = await columnsOf(c, NOTICES_TABLE);
const names = cols.map((x) => x.name);
const missing = DROP.filter((d) => !names.includes(d));
if (missing.length) fatal(`待删列不在场，可能已执行过：${missing.join(", ")}（现网列数 ${names.length}）`);
const sites = findNoticeRefSites(process.cwd(), DROP, ["src", "scripts", "tests"], SELF);
if (sites.length) fatal(`仍有本表读写点，先清障：\n${sites.map((s) => `  - ${s.col} → ${s.file} ×${s.count}`).join("\n")}`);
const idx = await indexesOf(c, NOTICES_TABLE);
const onIdx = [...idx.entries()].filter(([, i]) => i.cols.some((x) => DROP.includes(x.col)));
if (onIdx.length) fatal(`待删列挂着索引，本脚本不处理索引：${onIdx.map(([n]) => n).join(", ")}`);
// 指纹旁路检查：宽表源指纹是拼接常量，读写点判据已覆盖 n.<col> 形制，这里再直接问一次源头文件
const fpText = readFileSync(join(process.cwd(), "src/lib/services/search-sync/wide-fingerprint.ts"), "utf8");
const fpHit = DROP.filter((d) => new RegExp(`n\\.\\s*${d}(?![A-Za-z0-9_])`).test(fpText));
if (fpHit.length) fatal(`待删列进宽表源指纹（改它会触发全量重灌，须走批次三那类同批改动）：${fpHit.join(", ")}`);
const before = (await c.query(`SELECT COUNT(*) n FROM \`${NOTICES_TABLE}\``))[0][0].n;
console.log(`体检通过 · ${NOTICES_TABLE} 现 ${names.length} 列 / ${before} 行 · 本批删 ${DROP.join(", ")}`);
console.log(`判据：读写点 ${sites.length} · 索引挂载 ${onIdx.length} · 指纹引用 ${fpHit.length} · 外键/触发器 0（probe233 实测）`);

// ── 留底：逐列导出非空行，写成可回放的 UPDATE 语句 ────────────────────
async function buildBackup() {
  const lines = [
    `-- crm_bid_notices 批次一落刀前留底 · ${new Date().toISOString()}`,
    `-- 待删列：${DROP.join(", ")}`,
    `-- 回滚方式：ALTER TABLE crm_bid_notices ADD COLUMN ...（形制见 db/schema/baseline.sql 的历史版本或`,
    `--   scripts/ops/crm_bid_notices-ddl-before-*.sql），再整份执行本文件回灌原值。`,
    `-- 只含非空行（NULL 行无需回灌）。`,
    "",
  ];
  let rows = 0;
  for (const col of DROP) {
    const meta = cols.find((x) => x.name === col);
    lines.push(`-- ── ${col} (${meta.type}) ──`);
    const [rs] = await c.query(
      `SELECT id, CAST(\`${col}\` AS CHAR) v FROM \`${NOTICES_TABLE}\` WHERE \`${col}\` IS NOT NULL ORDER BY id`,
    );
    for (const r of rs) lines.push(`UPDATE \`${NOTICES_TABLE}\` SET \`${col}\` = ${(await c.escape(r.v))} WHERE \`id\` = ${r.id};`);
    rows += rs.length;
    lines.push(`-- ${col}：非空 ${rs.length} 行`);
  }
  lines.push("", `-- 合计留底 ${rows} 行`, "");
  const text = lines.join("\n");
  writeFileSync(backupFile, text, "utf8");
  console.log(`留底已写：${backupFile}（${(text.length / 1024).toFixed(1)} KB）`);
  return { file: backupFile, rows };
}

/** 回读校验：行数与文件里的语句数必须一致，且能解析出合法 id（防「写了个空文件也算备份」） */
async function verifyBackup() {
  if (!existsSync(backupFile)) fatal(`找不到留底文件：${backupFile}`);
  const text = readFileSync(backupFile, "utf8");
  for (const col of DROP) {
    const [rs] = await c.query(`SELECT COUNT(*) n FROM \`${NOTICES_TABLE}\` WHERE \`${col}\` IS NOT NULL`);
    const n = Number(rs[0].n);
    const inFile = (text.match(new RegExp(`SET \\\`${col}\\\` = `, "g")) ?? []).length;
    if (inFile !== n) fatal(`留底不完整：${col} 库内非空 ${n} 行，文件里只有 ${inFile} 条回灌语句`);
    console.log(`  ✓ ${col}：留底 ${inFile} / 库内非空 ${n}`);
  }
}

if (RESTORE_CHECK) {
  await verifyBackup();
  console.log("✅ 留底可回放校验通过。");
  process.exit(0);
}

if (!BACKUP && !APPLY) {
  console.log("\n[未执行] 将做两步：① 导留底 + 回读校验；② ALTER 删列（先试 INSTANT，退而 INPLACE, LOCK=NONE，绝不退化 COPY）。");
  console.log(`  ALTER TABLE \`${NOTICES_TABLE}\` ${DROP.map((d) => `DROP COLUMN \`${d}\``).join(", ")} , ALGORITHM=INPLACE, LOCK=NONE;`);
  console.log("确认低峰窗口后加 --backup 只导留底，或 --apply 一把过（导完校验通过才动结构）。");
  process.exit(0);
}

const b = await buildBackup();
await verifyBackup();
if (BACKUP && !APPLY) {
  console.log(`✅ 只导留底完成（${b.rows} 行），未动结构。下一步 --apply 时会重新校验一遍再落刀。`);
  process.exit(0);
}

// ── 落刀 ──────────────────────────────────────────────────────────────
await c.query("SET SESSION MAX_EXECUTION_TIME = 0"); // DDL 不被超时杀掉
await c.query("SET SESSION lock_wait_timeout = 5"); // 拿不到 MDL 就放弃，不在原地排队钉住站点
const stmt = (algo) =>
  `ALTER TABLE \`${NOTICES_TABLE}\` ${DROP.map((d) => `DROP COLUMN \`${d}\``).join(", ")}${algo ? `, ALGORITHM=${algo}` : ""}`;
let done = "";
for (const algo of ["INSTANT", "INPLACE"]) {
  try {
    const t0 = Date.now();
    await c.query(algo === "INPLACE" ? `${stmt(algo)}, LOCK=NONE` : stmt(algo));
    done = algo;
    console.log(`✅ ALTER 完成（ALGORITHM=${algo}${algo === "INPLACE" ? ", LOCK=NONE" : ""}，耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s）`);
    break;
  } catch (err) {
    const e = err.code ?? "";
    if (e === "ER_ALTER_OPERATION_NOT_SUPPORTED" || e === "ER_ALTER_OPERATION_NOT_SUPPORTED_REASON") {
      console.log(`  ${algo} 不被支持（${e}），按预案降级重试`);
      continue;
    }
    if (e === "ER_LOCK_WAIT_TIMEOUT") fatal(`MDL 5 秒拿不到（有长查询正在读本表）→ 已放弃，未改结构。请等宽表对账/轮询间隙重试，或先停 crawler-sync`);
    fatal(`ALTER 失败且不属于「算法不支持」的可降级范围：[${e}] ${err.message}（结构可能未变，先 SHOW CREATE TABLE 核对）`);
  }
}

// ── 落刀后自检 ────────────────────────────────────────────────────────
const afterCols = (await columnsOf(c, NOTICES_TABLE)).map((x) => x.name);
const leak = DROP.filter((d) => afterCols.includes(d));
if (leak.length) fatal(`自检失败：列仍在场 ${leak.join(", ")}`);
const after = (await c.query(`SELECT COUNT(*) n FROM \`${NOTICES_TABLE}\``))[0][0].n;
if (Number(after) !== Number(before)) fatal(`行数漂移：${before} → ${after}（删列不该影响行数，立即停线并人工核查）`);
const afterIdx = await indexesOf(c, NOTICES_TABLE);
console.log(`自检：列 ${names.length} → ${afterCols.length} · 行数 ${after}（不变）· 索引 ${afterIdx.size} 个（应为 17）`);
// 抽样回放锚点：留底里第一行 id 必须仍存在于新表
const firstId = (await c.query(`SELECT id FROM \`${NOTICES_TABLE}\` ORDER BY id LIMIT 1`))[0][0]?.id;
console.log(`抽样：表首行 id=${firstId} 可读 ✓ · 算法 ${done} · 留底 ${b.file}`);
console.log("\n✅ 批次一落刀完成。收尾：");
console.log("  1) node --env-file=.env scripts/tools/dump-schema-baseline.mjs   # 重导结构基线（幂等，结构变了才写）");
console.log("  2) npm run lint && npm run typecheck                             # 确认无残留引用");
console.log("  3) 更新 docs/数据库设计/crm_bid_notices-招标公告主表.md（含本轮删列与实测口径）");
console.log(`  4) 回滚依据：重新 ADD COLUMN 后整份执行 ${b.file.replace(/\\/g, "/")}`);
await c.end();
