/**
 * 把 Mercell 等源里裸 `Contract` 的公告按内容重分类，并重建服务表投影。
 *
 * 背景：Mercell 只给一个笼统的 Contract 类型，旧归一逻辑无此值 → 整批落 OTHER。
 * 现口径：母类 CONTRACT_NOTICE，按标题/正文细分 DPS / QUAL_SYSTEM / FRAMEWORK。
 *
 * 用法：
 *   npx tsx scripts/tools/notice-public-reclassify-contract.ts           # DRY：只统计，不写库
 *   npx tsx scripts/tools/notice-public-reclassify-contract.ts --apply   # 重建 notice_public
 *   npx tsx scripts/tools/notice-public-reclassify-contract.ts --apply --sync  # 再同步 Meili
 *
 * 只走 notice_public 的官方重建入口（rebuildPublicRowsByIds → buildPublicRow），
 * 不直接 UPDATE 业务字段；回滚 SQL 会先导出到临时目录。
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { classifyBareContractNotice } from "../../src/shared/constants/notice-type";
import { rebuildPublicRowsByIds } from "../../src/lib/services/notice-public/rebuild";
import { buildPublicColumnRollbackSql } from "../../src/lib/services/notice-public/build";
import { syncNoticeIds } from "../../src/lib/services/meilisearch/sync";
import { tryRecover } from "../../src/lib/services/meilisearch/client";
import { syncWideIds } from "../../src/lib/services/search-sync";

const APPLY = process.argv.includes("--apply");
const SYNC = process.argv.includes("--sync");
const SYNC_ONLY = process.argv.includes("--sync-only");
const WIDE_ONLY = process.argv.includes("--wide-only");
const CHUNK = 500;

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm",
  charset: "utf8mb4",
  connectionLimit: 4,
});

const [rows] = await pool.query<RowDataPacket[]>(`
  SELECT np.notice_pk AS id, np.notice_type_code AS curr, np.title, LEFT(bn.description, 4000) AS descr
  FROM notice_public np
  JOIN bid_notices bn ON bn.id = np.notice_pk
  WHERE bn.notice_type = 'Contract'`);

const plan = new Map<number, string>();
const bucket = new Map<string, number>();
const samples = new Map<string, string[]>();
for (const r of rows) {
  const next = classifyBareContractNotice(String(r.title ?? ""), String(r.descr ?? ""));
  plan.set(Number(r.id), next);
  bucket.set(next, (bucket.get(next) ?? 0) + 1);
  const arr = samples.get(next) ?? [];
  if (arr.length < 5) arr.push(String(r.title ?? "").slice(0, 80));
  samples.set(next, arr);
}

console.log(`候选公告：${rows.length} 条`);
console.log("目标分布：", Object.fromEntries([...bucket.entries()].sort((a, b) => b[1] - a[1])));
for (const [code, list] of samples) console.log(`  [${code}] 样例：${list.join(" | ")}`);
const changed = rows.filter((r) => String(r.curr) !== plan.get(Number(r.id)));
console.log(`需要变更：${changed.length} 条（当前已正确的 ${rows.length - changed.length} 条）`);

if (!APPLY && !SYNC_ONLY) {
  console.log("DRY 模式：未写库。加 --apply 执行重建，或 --sync-only 只补 Meili。");
  await pool.end();
  process.exit(0);
}

if (SYNC_ONLY || WIDE_ONLY) {
  const healthy = await tryRecover();
  const wide = await syncWideIds(pool, [...plan.keys()]);
  const res = await syncNoticeIds(pool, [...plan.keys()]);
  console.log("宽表重建：", JSON.stringify(wide), "Meili 同步：", JSON.stringify(res), healthy ? "" : "（Meili 不可达）");
  await pool.end();
  process.exit(0);
}

// 回滚 SQL：按原值分组，恢复成变更前的 notice_type_code
const byOld = new Map<string, number[]>();
for (const r of changed) {
  const old = String(r.curr);
  const arr = byOld.get(old) ?? [];
  arr.push(Number(r.id));
  byOld.set(old, arr);
}
const rollback = buildPublicColumnRollbackSql("notice_type_code", byOld);
const rollbackFile = path.join(
  process.env.TEMP || "C:\\Users\\苏御凡\\AppData\\Local\\Temp",
  "qwenwork",
  `notice-contract-rollback-${Date.now()}.sql`,
);
writeFileSync(rollbackFile, `-- ${new Date().toISOString()} 裸 Contract 重分类回滚\n${rollback}`, "utf8");
console.log(`回滚 SQL：${rollbackFile}`);

const ids = [...plan.keys()].sort((a, b) => a - b);
for (let i = 0; i < ids.length; i += CHUNK) {
  await rebuildPublicRowsByIds(pool, ids.slice(i, i + CHUNK));
}

const [after] = await pool.query<RowDataPacket[]>(
  `SELECT notice_type_code, COUNT(*) n FROM notice_public
    WHERE notice_pk IN (${ids.join(",")}) GROUP BY notice_type_code ORDER BY n DESC`,
);
console.log("重建后分布：", JSON.stringify(after));

if (SYNC) {
  await tryRecover();
  const wide = await syncWideIds(pool, ids);
  const res = await syncNoticeIds(pool, ids);
  console.log("宽表重建：", JSON.stringify(wide), "Meili 同步：", JSON.stringify(res), res.synced === 0 ? "（Meili 未启用/不可达，本次未同步）" : "");
}

await pool.end();