/**
 * Meili country_codes 大批量重推（2026-11-11 事故修法）。
 *
 * 背景：syncNoticeIds 的 addDocumentsInBatches(docs, 500) 把 888k 文档拆成 1,777 个
 * 500-doc 任务，在 8G 换页抖动的机器上每任务分钟级，队列 16h+ 排不完。
 * 本驱动：每 20k 文档一个 addDocuments 任务（~45 个任务），文档构建与 syncNoticeIds
 * 完全同源（buildSyncDocFromWideTable + bid_notices 权威值覆盖）。
 *
 * 前置：先取消队列里积压的小任务（本驱动全量覆盖所有 id，被取消的都在覆盖面内）：
 *   curl -X POST "$HOST/tasks/cancel?indexUids=notices&types=documentAdditionOrUpdate&statuses=enqueued" -H auth
 * 用法（服务器，cwd=/root/supply-os）：npx tsx scripts/tools/meili-country-bulk-repush.ts
 */
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";

for (const f of ["/root/supply-os/.next/standalone/.env", "/root/supply-os/.env"]) {
  try {
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
    }
  } catch { /* ignore */ }
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
const sync = await import("../../src/lib/services/meilisearch/sync.ts");
meili.initMeilisearch();
if (!meili.isHealthy() && !(await meili.tryRecover())) {
  console.error("Meili 不可用"); process.exit(1);
}
const INDEX = meili.getIndexName();
const client = meili.getClient()!;
const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);
log(`Meili 就绪 index=${INDEX} docs=${await meili.getDocCount()}`);

const WIDE_SQL = `
  SELECT id, notice_id, reference, title, description,
         country_name, country_codes, buyer_name, notice_type_code,
         deadline_sec, is_featured, is_opportunity, estimated_value, documents_count,
         backbone_path,
         title_zh, description_zh, title_en, description_en,
         title_fr, description_fr, title_ru, description_ru,
         title_es, description_es, title_ar, description_ar
  FROM notice_search`;

const CHUNK = 20000, SQLB = 2000;
const t0 = Date.now();
let lastId = 0, pushed = 0, tasks = 0;

for (;;) {
  const [idsRows] = await pool.query(`SELECT id FROM notice_search WHERE id > ? ORDER BY id ASC LIMIT ?`, [lastId, CHUNK]);
  const ids = (idsRows as Array<{ id: number }>).map((r) => Number(r.id));
  if (ids.length === 0) break;

  const docs: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += SQLB) {
    const batch = ids.slice(i, i + SQLB);
    const ph = batch.map(() => "?").join(",");
    const [wideRows, statusRows] = await Promise.all([
      pool.query(`${WIDE_SQL} WHERE id IN (${ph}) ORDER BY id ASC`, batch),
      pool.query(
        `SELECT id, is_featured, COALESCE(deadline_sec,0) AS deadline_sec, entry_source, IFNULL(rfq_status,'') AS rfq_status
           FROM bid_notices WHERE id IN (${ph})`, batch,
      ),
    ]);
    const statusMap = new Map<number, { is_featured: number; deadline_sec: number }>();
    for (const row of statusRows[0] as RowDataPacket[]) {
      statusMap.set(Number(row.id), {
        is_featured: row.is_featured ? 1 : 0,
        deadline_sec: Number(row.deadline_sec) || 0,
      });
    }
    for (const r of wideRows[0] as RowDataPacket[]) {
      const doc = sync.buildSyncDocFromWideTable(r) as Record<string, unknown>;
      const st = statusMap.get(Number(doc.id));
      if (st) {
        doc.is_featured = st.is_featured;
        doc.deadline_sec = st.deadline_sec;
        doc.has_deadline = st.deadline_sec > 0 ? 1 : 0;
      }
      docs.push(doc);
    }
  }
  if (docs.length > 0) {
    await client.index(INDEX).addDocuments(docs, { primaryKey: "id" });
    tasks++;
    pushed += docs.length;
    lastId = ids[ids.length - 1];
    log(`任务 ${tasks}：${docs.length} 文档（id≤${lastId}）· 累计推送 ${pushed} · ${Math.round((Date.now() - t0) / 1000)}s`);
  } else {
    lastId = ids[ids.length - 1]; // 宽表缺行批次也推进水位
  }
}
log(`完成：${tasks} 个批量任务 · 推送 ${pushed} · 耗时 ${Math.round((Date.now() - t0) / 1000)}s（Meili 异步索引中）`);
await pool.end();
