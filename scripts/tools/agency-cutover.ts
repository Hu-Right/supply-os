/**
 * 来源机构重锚 cutover（部署后在云端执行）：把宽表 buyer_name 重算为 agency_full||agency，
 * 再蓝绿重建 Meili 索引，使「来源机构」展示/筛选真正落到采购主体。顺带完成 p8（country_codes 进索引）。
 *
 * 用法：
 *   npx tsx scripts/tools/agency-cutover.ts --dry     # 只读：打印影响面，不写库/不碰 Meili（本地安全）
 *   npx tsx scripts/tools/agency-cutover.ts --apply   # 云端：fullBackfill 重算宽表 → fullSync 蓝绿重灌 → 校验
 *   npx tsx scripts/tools/agency-cutover.ts --apply --skip-backfill   # 仅重灌 Meili（宽表已重算过时）
 */
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { ACTIVE_NOTICE_WHERE } from "../../src/lib/utils/notice-expired";

const DRY = process.argv.includes("--dry");
const APPLY = process.argv.includes("--apply");
const SKIP_BACKFILL = process.argv.includes("--skip-backfill");
if (!DRY && !APPLY) {
  console.error("请指定 --dry（只读预览）或 --apply（生产切换）。");
  process.exit(2);
}

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const pool = await mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm", charset: "utf8mb4", connectionLimit: 2,
});

// 影响面（只读）
const [r] = ((await pool.query(
  `SELECT COUNT(*) tot,
     SUM(CASE WHEN agency_full IS NOT NULL AND agency_full<>'' AND agency_full<>IFNULL(agency,'') THEN 1 ELSE 0 END) changed
   FROM bid_notices n WHERE ${ACTIVE_NOTICE_WHERE}`,
)) as unknown as [{ tot: number; changed: number }[], unknown]);
const tot = Number(r[0].tot), changed = Number(r[0].changed);
console.log(`活跃公告 ${tot.toLocaleString()} 行 · 重锚将改变机构展示 ${changed.toLocaleString()} 行 (${(changed / tot * 100).toFixed(1)}%)`);

if (DRY) {
  console.log("[dry] 未写入。确认无误后在云端执行：npx tsx scripts/tools/agency-cutover.ts --apply");
  await pool.end();
  process.exit(0);
}

// —— 生产切换（云端）——
if (!SKIP_BACKFILL) {
  const { fullBackfill } = await import("../../src/lib/services/search-sync/sync-scheduler");
  const t0 = Date.now();
  const bf = await fullBackfill(pool);
  console.log(`✓ fullBackfill 重算宽表：${bf.synced} 行，耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

const { initMeilisearch, ensureIndex, getIndexName, fullSync } = await import("../../src/lib/services/meilisearch/index");
const client = initMeilisearch();
if (!client) throw new Error("Meilisearch 客户端未初始化（检查 MEILI_HOST/MEILI_MASTER_KEY）——请在云端运行");
if (!(await ensureIndex())) throw new Error("Meili 索引未就绪，终止");
const name = getIndexName();
const before = await client.index(name).getStats().catch(() => null);
console.log(`重建前文档数：${before?.numberOfDocuments ?? "未知"} · 索引=${name}`);

const t1 = Date.now();
const fs = await fullSync(pool);
if (fs.synced === 0) throw new Error("fullSync 返回 0 条：并发锁未释放或健康检查失败");
console.log(`✓ fullSync 蓝绿重灌：${fs.synced} 条，耗时 ${((Date.now() - t1) / 1000).toFixed(0)}s，已原子 swap`);

const after = await client.index(name).getStats().catch(() => null);
console.log(`重建后文档数：${after?.numberOfDocuments ?? "未知"}`);
console.log("✓ 来源机构 cutover 完成。请抽验：卡片/详情「来源机构」=真实采购单位；按机构筛选可命中。");
await pool.end();
