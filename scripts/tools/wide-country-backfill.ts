/**
 * 宽表 country_codes 存量回填 + Meili 增量重推（2026-11-11）。
 *
 * 背景：10-30 国家归一批次给宽表加列后，存量投影未回填——notice_search 的 country_codes
 * 全空（实测 888,300/888,300），国家级筛选（country=XX）走宽表/Meili 链路恒 0 命中；
 * notice_public 侧 0 缺口（投影源是健康的，缺的只是宽表存量 + 索引文档）。
 *
 * 链路（唯一写入者，与 in-app 同源）：
 *   ① fullBackfill()：全量重算宽表（keyset 200/批，内存友好），顺带收敛所有投影列漂移；
 *   ② syncNoticeIds()：keyset 1000/批 增量重推 Meili（await 非 fullSync，搜索不掉线、
 *      文档原地更新，不做临时索引 swap）。
 *
 * 断点续跑：state 文件记 phase/lastId（两阶段幂等，挂了重跑即续）。
 * 用法（服务器，cwd=/root/supply-os）：
 *   npx tsx scripts/tools/wide-country-backfill.ts [--skip-wide]   # --skip-wide 只推 Meili
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import mysql from "mysql2/promise";

// 凭证：进程读 .next/standalone/.env（与 pm2 同源），根 .env 兜底；值剥引号
for (const f of ["/root/supply-os/.next/standalone/.env", "/root/supply-os/.env"]) {
  try {
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
    }
  } catch { /* 兜底文件不存在忽略 */ }
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "crm",
  charset: "utf8mb4",
  connectionLimit: 3,
  connectTimeout: 120000,
});

const meili = await import("../../src/lib/services/meilisearch/index");
const sched = await import("../../src/lib/services/search-sync/sync-scheduler");

const STATE = "/root/supply-os/runtime/wide-country-backfill.state.json";
const loadState = () => {
  try { return JSON.parse(readFileSync(STATE, "utf8")) as { wideDone?: boolean; lastId?: number }; }
  catch { return {}; }
};
const saveState = (s: { wideDone?: boolean; lastId?: number }) => writeFileSync(STATE, JSON.stringify(s));
const state = loadState();
const SKIP_WIDE = process.argv.includes("--skip-wide");

const t0 = Date.now();
const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

// ── Meili 就绪 ──
meili.initMeilisearch();
if (!(meili.isHealthy())) {
  const ok = await meili.tryRecover();
  if (!ok) { console.error("Meili 不可用且自愈失败，终止（宽表阶段不受影响可先跑）"); }
}
await meili.ensureIndex();
log(`Meili 就绪：index=${meili.getIndexName()} docs=${await meili.getDocCount()}`);

// ── ① 宽表全量重算 ──
if (!state.wideDone && !SKIP_WIDE) {
  log("① fullBackfill 开始（keyset 200/批，预计数十分钟）…");
  const r = await sched.fullBackfill(pool);
  log(`① fullBackfill 完成：synced=${r.synced} · ${Math.round(r.elapsed / 1000)}s`);
  state.wideDone = true;
  saveState(state);
} else {
  log("① 跳过宽表（已完成或 --skip-wide）");
}

const [empty] = await pool.query(`SELECT COUNT(*) n FROM notice_search WHERE country_codes IS NULL OR country_codes=''`);
log(`宽表 country_codes 仍空：${(empty as any[])[0].n} 行`);

// ── ② Meili keyset 增量重推 ──
let lastId = state.lastId ?? 0;
let processed = 0, pushed = 0, emptyBatches = 0;
log(`② Meili 增量重推开始（keyset 1000/批，起始 lastId=${lastId}）…`);
for (;;) {
  const [rows] = await pool.query(`SELECT id FROM notice_search WHERE id > ? ORDER BY id ASC LIMIT 1000`, [lastId]);
  const list = (rows as Array<{ id: number }>).map((r) => Number(r.id));
  if (list.length === 0) break;
  const r = await meili.syncNoticeIds(pool, list);
  if (r.synced + r.deleted === 0) {
    emptyBatches++;
    if (emptyBatches > 5) {
      console.error(`连续 ${emptyBatches} 批 0 推送（Meili 不健康或链路断），在 lastId=${lastId} 停止；重跑本脚本自动续`);
      process.exit(2);
    }
  } else emptyBatches = 0;
  processed += list.length;
  pushed += r.synced;
  lastId = list[list.length - 1];
  state.lastId = lastId;
  saveState(state);
  if (processed % 20000 < 1000) {
    const [done] = await pool.query(`SELECT COUNT(*) n FROM notice_search WHERE id <= ?`, [lastId]);
    log(`进度：id≤${lastId} 覆盖 ${(done as any[])[0].n} 行 · 推送 ${pushed}`);
  }
}
log(`② 完成：扫描 ${processed} 行 · Meili 推送 ${pushed} · 总耗时 ${Math.round((Date.now() - t0) / 1000)}s`);

const [chk] = await pool.query(
  `SELECT (SELECT COUNT(*) FROM notice_search WHERE country_codes IS NULL OR country_codes='') wide_empty,
          (SELECT COUNT(*) FROM notice_search) total`,
);
console.log("终态：", JSON.stringify((chk as any[])[0]));
await pool.end();
if (existsSync(STATE)) writeFileSync(STATE, JSON.stringify({ done: true }));
