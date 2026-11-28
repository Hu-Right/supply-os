/**
 * Meilisearch 全量重建（可断点续跑）— 远端库/SSH 隧道不稳时用这个
 *
 * 与 fullSync 的区别：
 *  - 以 notice_pk 游标分片推进，每片 2000 行；片子成功入队后才推进并落盘 state；
 *  - 任何一片失败（隧道断、超时）只作废该片，进程退出后重跑从 state.cursor 续；
 *  - 写入阶段不等待 Meili 索引追平（避免大 backlog 阻塞整轮），结束后统一等待并 swap。
 *
 * 用法：
 *   npx tsx scripts/tools/meili-rebuild-resumable.ts            # 续跑/开始，完成后原子切换
 *   npx tsx scripts/tools/meili-rebuild-resumable.ts --dry-run  # 只读库统计，不写 Meili
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import mysql from "mysql2/promise";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const { initMeilisearch, getIndexName, buildNoticeIndexSettings } = await import(
  "../../src/lib/services/meilisearch/client"
);
const { buildSyncDocFromPublic, WIDE_TABLE_SYNC_ADMISSION, PUBLIC_SYNC_SQL } = await import(
  "../../src/lib/services/meilisearch/sync"
);

const DRY = process.argv.includes("--dry-run");
const CHUNK = Number(process.env.MEILI_REBUILD_CHUNK || 2000);
const STATE_PATH = "tmp/meili-rebuild-state.json";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 2,
  connectTimeout: 20_000,
});

async function queryWithRetry(sql: string, params: unknown[], attempts = 8): Promise<unknown[]> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const [rows] = await pool.query(sql, params);
      return rows as unknown[];
    } catch (e) {
      last = e;
      const code = String((e as { code?: string }).code ?? "");
      const transient = ["PROTOCOL_CONNECTION_LOST", "ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EHOSTUNREACH"].includes(code);
      if (!transient || i === attempts - 1) throw e;
      const wait = Math.min(20_000, 500 * 2 ** i);
      console.warn(`[rebuild] 查询失败，重试 ${i + 1}/${attempts}（${wait}ms）: ${String((e as Error).message).slice(0, 100)}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw last;
}

initMeilisearch();
const base = getIndexName();
const state = existsSync(STATE_PATH)
  ? JSON.parse(readFileSync(STATE_PATH, "utf8"))
  : { index: `${base}_rb_${Date.now()}`, cursor: 0, total: 0 };

if (DRY) {
  const rows = (await queryWithRetry(
    `SELECT COUNT(*) AS c FROM notice_public WHERE ${WIDE_TABLE_SYNC_ADMISSION}`,
    [],
  )) as Array<{ c: number }>;
  console.log("eligible rows:", rows[0].c);
  process.exit(0);
}

mkdirSync("tmp", { recursive: true });
const client = initMeilisearch();
if (!client) throw new Error("MEILI 未启用或客户端不可用");
const idx = client.index(state.index);
try {
  await client.createIndex(state.index, { primaryKey: "id" });
  await idx.updateSettings(buildNoticeIndexSettings());
} catch {
  /* 续跑：索引已存在 */
}
console.log(`[rebuild] 目标索引 ${state.index}，从 cursor=${state.cursor} 续跑`);

let lastLog = Date.now();
for (;;) {
  const rows = (await queryWithRetry(
    PUBLIC_SYNC_SQL +
      ` WHERE notice_pk > ? AND ${WIDE_TABLE_SYNC_ADMISSION} ORDER BY notice_pk ASC LIMIT ?`,
    [state.cursor, CHUNK],
  )) as Array<Record<string, unknown>>;
  if (rows.length === 0) break;

  const docs = rows.map((r) => buildSyncDocFromPublic(r as never));
  await idx.addDocumentsInBatches(docs, 500, { primaryKey: "id" });

  const lastPk = Number(rows[rows.length - 1].notice_pk);
  if (!Number.isFinite(lastPk) || lastPk <= state.cursor) {
    throw new Error(`notice_pk 未前进：cursor=${state.cursor} last=${String(rows[rows.length - 1].notice_pk)}`);
  }
  state.cursor = lastPk;
  state.total += docs.length;
  writeFileSync(STATE_PATH, JSON.stringify(state));

  if (Date.now() - lastLog > 15_000) {
    lastLog = Date.now();
    console.log(`[rebuild] 已投递 ${state.total} 条，cursor=${state.cursor}`);
  }
  if (rows.length < CHUNK) break;
}

console.log(`[rebuild] 投递完成 ${state.total} 条，等待 Meili 索引追平…`);
for (;;) {
  const stats = await idx.getStats();
  const pending = await client.tasks.getTasks({
    indexUids: [state.index],
    statuses: ["enqueued", "processing"],
    limit: 1,
  } as never);
  if (stats.numberOfDocuments >= state.total && (pending.results?.length ?? 0) === 0) break;
  await new Promise((r) => setTimeout(r, 5000));
}
console.log(`[rebuild] 索引就绪 ${state.total} 条，执行 swap…`);
await client.swapIndexes([{ indexes: [base, state.index], rename: false }]);
await new Promise((r) => setTimeout(r, 5000));
const after = await client.index(base).getStats();
console.log(`[rebuild] swap 完成，主索引 ${after.numberOfDocuments} 条`);
await client.deleteIndex(state.index).catch(() => {});
console.log(`[rebuild] 已清理临时索引 ${state.index}`);
await pool.end();
