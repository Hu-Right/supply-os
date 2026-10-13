/**
 * Meilisearch 全量重建 + 新属性 backbone_node 端到端验真
 *
 * 做什么：跑一次应用内同一个 fullSync（蓝绿临时索引 + 原子 swap），然后核对
 *   1) 索引设置里 backbone_node 在、commodity_prefix 不再出现；
 *   2) Meili 按节点码筛出来的条数，与 MySQL 的 FIND_IN_SET(?, backbone_path) 逐档相等。
 * 为什么要跑：另一会话把族级落点改了口径，而 Meili 侧的 backbone_node 是**新属性**——
 *   对存量文档不会自动回填。不重建就只能永远降级 MySQL（738ms 实测），这条链没被验证过。
 * 边界：只写本机 Meili（127.0.0.1:7700），不动任何库表；读侧走 .env 的 DB_*。
 *
 * 为什么从 scripts/ops/ 搬进来（2026-10-13）：品目树改码 UGT-B-… → UGT-… 时，
 *   `commodity-prefix-rename-data.ts` 只平移了库内三列，Meili 索引留在旧码 ⇒ 线上按分类筛
 *   「新码谓词 vs 旧码文档」永不命中，列表整体空掉且不报错。而增量同步按
 *   `updated_at >= NOW()-10min LIMIT 2000 ORDER BY id ASC` 取变更（sync.ts），35.9 万行的批量
 *   平移根本排不完、且每轮都从最小 id 重推 ⇒ **不会自愈，必须手动全量重灌**。
 *   这个脚本正是「重灌 + 判定是否真的对齐」的唯一工具：留在被 gitignore 的 ops/ 里，
 *   线上机器就没有它，事故时无从下手。按 .gitignore 的生命周期分层，它是**持久手动工具**
 *   （每次值域平移都要跑），归 tools 而非 ops。
 * 完成判定：退出码非 0 = 未对齐，值域平移不算完成（不要只看它打印了什么）。
 *
 * 用法：npx tsx scripts/tools/meili-fullsync-verify.ts [--skip-sync]（--skip-sync 只核对现状）
 */
import { readFileSync, writeFileSync } from "node:fs";
import mysql from "mysql2/promise";

const SKIP_SYNC = process.argv.includes("--skip-sync");

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
// 应用里的客户端要显式初始化：MEILI_ENABLED=off 时 instrumentation 不会替我建
const { initMeilisearch, ensureIndex, getIndexName, fullSync } = await import(
  "../../src/lib/services/meilisearch/index"
);

const o: string[] = [];
const stamp = new Date().toISOString();

const pool = await mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm", charset: "utf8mb4", connectionLimit: 2,
});
const q = async <T = Record<string, unknown>>(sql: string, p?: unknown[]): Promise<T[]> =>
  ((await pool.query(sql, p)) as unknown as [T[], unknown])[0];

const client = initMeilisearch();
if (!client) throw new Error("Meilisearch 客户端未初始化（检查 MEILI_HOST/MEILI_MASTER_KEY）");
const ok = await ensureIndex();
o.push(`ensureIndex：${ok ? "就绪" : "未就绪"}，索引=${getIndexName()}，host=${process.env.MEILI_HOST}`);
if (!ok) throw new Error("索引未就绪，终止");

const name = getIndexName();
const before = await client.index(name).getStats().catch(() => null);
o.push(`重建前文档数：${before?.numberOfDocuments ?? "未知"}`);

if (!SKIP_SYNC) {
  const t0 = Date.now();
  const r = await fullSync(pool);
  o.push(`fullSync：写入 ${r.synced} 条，耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s，水位 id=${r.lastId}`);
  if (r.synced === 0) throw new Error("fullSync 返回 0 条：多半是并发锁未释放或健康检查失败");
}

let bad = 0;
const settings = await client.index(name).getSettings();
const filt = (settings.filterableAttributes ?? []) as string[];
o.push(`\n==== 1. filterableAttributes 形制 ====`);
o.push(`  backbone_node 在位：${filt.includes("backbone_node") ? "✅" : "✗ 缺失"}`);
o.push(`  precise_backbone_node 已退场：${filt.includes("precise_backbone_node") ? "✗ 还在" : "✅"}`);
o.push(`  commodity_prefix 已退场：${filt.includes("commodity_prefix") ? "✗ 还在" : "✅"}`);
o.push(`  全清单：${filt.join(", ")}`);
if (!filt.includes("backbone_node") || filt.includes("precise_backbone_node")) bad++;

const stats = await client.index(name).getStats();
const wide = await q<{ n: number }>(`SELECT COUNT(*) n FROM crm_notice_search`);
o.push(`\n==== 2. 覆盖率 ====`);
o.push(`  Meili ${stats.numberOfDocuments} 文档 / 宽表 ${wide[0]!.n} 行`);

// 3. 逐档对拍：Meili 等值筛 vs MySQL FIND_IN_SET（同一谓词两种方言）
//    码样必须两侧都有量：拿一个树上不存在（或零公告）的码去对拍，0==0 恒等，断言没有牙。
//    下面 5 个覆盖 L1/L2/L3 与两个不同大类，改树后若哪个 MySQL 侧为 0，就换成当时有量的码。
const CODES = ["UGT-01", "UGT-0101", "UGT-010101", "UGT-100701", "UGT-240203"];
o.push(`\n==== 3. 节点码筛数对拍（Meili filter vs MySQL FIND_IN_SET）====`);
for (const code of CODES) {
  const hit = await client.index(name).search("", { filter: [`backbone_node = "${code}"`], limit: 0 });
  // SDK 的分页联合类型不直接暴露 totalHits（同一绕法见 search-orchestrator/meili-query.ts）
  const counts = hit as unknown as { totalHits?: number | null; estimatedTotalHits?: number | null };
  const meiliN = Number(counts.totalHits ?? counts.estimatedTotalHits ?? -1);
  const my = await q<{ n: number }>(
    `SELECT COUNT(*) n FROM crm_notice_search WHERE FIND_IN_SET(?, backbone_path)`,
    [code],
  );
  const mysqlN = Number(my[0]!.n);
  const gap = Math.abs(meiliN - mysqlN);
  if (gap > Math.max(20, mysqlN * 0.001)) bad++;
  o.push(`  ${code}：Meili ${meiliN} / MySQL ${mysqlN} ⇒ ${gap === 0 ? "完全相等" : `差 ${gap}${gap > Math.max(20, mysqlN * 0.001) ? " ✗" : "（估算容差内）"}`}`);
}

// 4. 反向断言：旧属性不再被索引接受（用错就报错，不会静默筛出全集）
try {
  await client.index(name).search("", { filter: [`commodity_prefix = "1010"`], limit: 0 });
  o.push(`\n==== 4. ✗ commodity_prefix 仍然可筛（索引里还留着旧属性）`);
  bad++;
} catch (err) {
  o.push(`\n==== 4. ✅ commodity_prefix 已不可筛：${(err as Error).message.slice(0, 90)}`);
}

await writeFileSync(`runtime/meili-fullsync-verify-${stamp.replace(/[:.]/g, "-")}.json`, JSON.stringify({ stamp, lines: o }, null, 2), "utf8");
console.log(o.join("\n"));
console.log(bad === 0 ? "\n✅ 端到端验真通过" : `\n✗ ${bad} 项不一致`);
await pool.end();
process.exit(bad === 0 ? 0 : 1);
