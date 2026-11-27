/**
 * 买家中文名批量落库（bulk 版）
 *
 * @module scripts/tools/apply-buyer-zh-bulk
 * @description 与 `apply-buyer-zh-batch.ts` 同一口径，但把「逐行 SELECT/INSERT」换成
 *              分块批量查询与多值 INSERT —— 万级名字时从 0.8 秒/行降到毫秒级。
 *
 *              口径保持一致：
 *              - 中文名必须纯中文、非过泛、非原文透传、长度 2–120（与 batch 版相同的闸门）；
 *              - 先按 canonical_name 复用已有实体（同国），未命中才建档；
 *              - 同一别名已指向其他实体 → 不抢，计入冲突；
 *              - 只经 `refreshBuyerProjection` 重建服务表投影，绝不直写 notice_public。
 *
 *              与 batch 版的差异（有意为之）：
 *              - `buyer_candidate.suggested_buyer_id` 一并写入（bulk 用临时表 JOIN，commit 前删）；
 *              - 公告匹配用 `TRIM(buyer_name) IN (...)`，能吃到名字前后带空格的行。
 *
 * 用法：
 *   npx tsx scripts/tools/apply-buyer-zh-bulk.ts temp/xxx.tsv           # DRY：只报计划
 *   npx tsx scripts/tools/apply-buyer-zh-bulk.ts temp/xxx.tsv --apply   # 落库 + 重建投影
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import mysql, { type PoolConnection, type RowDataPacket } from "mysql2/promise";
import { isPureChineseBuyerName, isTooGenericBuyerName } from "../../src/lib/services/buyer/normalize";
import { refreshBuyerProjection } from "../../src/lib/services/buyer/refresh";
import { syncNoticeIds } from "../../src/lib/services/meilisearch";

const APPLY = process.argv.includes("--apply");
const FILE = process.argv.find((a) => a.endsWith(".tsv"));
if (!FILE) {
  console.error("用法: npx tsx scripts/tools/apply-buyer-zh-bulk.ts <file.tsv> [--apply]");
  process.exit(1);
}

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const sha = (s: string): string => createHash("sha256").update(s).digest("hex");
const norm = (s: string): string => s.normalize("NFKC").replace(/\s+/g, " ").trim();
const stripCode = (s: string): string => s.replace(/^\d{2,}[A-Z0-9]*\s*[-–—]\s*/i, "").trim() || s;
const fixPunct = (s: string): string => s.replace(/[;；]/g, "、").replace(/,/g, "，").replace(/:/g, "：").replace(/\s+/g, " ").trim();

interface Raw { country: string; name: string; zh: string }

const rows: Raw[] = [];
const skipped: string[] = [];
for (const line of readFileSync(FILE, "utf8").split(/\r?\n/)) {
  if (!line.trim()) continue;
  const cols = line.split("\t").map((s) => s.trim());
  if (cols.length < 3) { skipped.push(`列不足: ${line.slice(0, 60)}`); continue; }
  const country = (cols[0] ?? "").toUpperCase().slice(0, 2);
  const name = norm(cols[1] ?? "").slice(0, 500);
  const zh = fixPunct(cols[2] ?? "").slice(0, 500);
  if (!/^[A-Z]{2}$/.test(country) || !name || !zh) { skipped.push(`字段非法: ${line.slice(0, 60)}`); continue; }
  if (zh === name) { skipped.push(`原样返回: ${name.slice(0, 40)}`); continue; }
  if (!isPureChineseBuyerName(zh)) { skipped.push(`非纯中文: ${name.slice(0, 40)}`); continue; }
  if (isTooGenericBuyerName(zh)) { skipped.push(`过泛: ${name.slice(0, 40)}`); continue; }
  if (zh.length < 2 || zh.length > 120) { skipped.push(`长度越界: ${name.slice(0, 40)}`); continue; }
  if (/[;；]/.test(name)) { skipped.push(`多实体拼接: ${name.slice(0, 40)}`); continue; }
  rows.push({ country, name, zh });
}

// 同国同 canonical 去重（大小写不敏感），保序
const unique = new Map<string, Raw>();
for (const r of rows) {
  const canonical = stripCode(r.name);
  const key = `${r.country}|${canonical.toLowerCase()}`;
  if (!unique.has(key)) unique.set(key, { ...r, name: canonical });
}
const list = [...unique.values()];
console.log(`[bulk] 读入 ${rows.length} 行 · 去重后 ${list.length} 个实体候选 · 预检跳过 ${skipped.length}`);

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  charset: "utf8mb4", connectionLimit: 3,
  // 本机到库是 SSH 隧道：长任务（重建 4 万条投影）空闲时会被掐断，开 keepAlive 并缩短空闲回收
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

const CHUNK = 400;
const chunkOf = <T,>(arr: T[], size = CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};
const byCountry = new Map<string, Raw[]>();
for (const r of list) {
  const arr = byCountry.get(r.country) ?? [];
  arr.push(r);
  byCountry.set(r.country, arr);
}

// ① 已有实体（按国家 + canonical 精确名）
const existing = new Map<string, number>();
for (const [country, arr] of byCountry) {
  for (const chunk of chunkOf(arr)) {
    const [found] = await pool.query<RowDataPacket[]>(
      `SELECT buyer_id, canonical_name FROM buyer
        WHERE status='active' AND country_code = ? AND canonical_name IN (${chunk.map(() => "?").join(",")})`,
      [country, ...chunk.map((r) => r.name)],
    );
    for (const f of found) {
      existing.set(`${country}|${String(f.canonical_name).toLowerCase()}`, Number(f.buyer_id));
    }
  }
}
const toCreate = list.filter((r) => !existing.has(`${r.country}|${r.name.toLowerCase()}`));
console.log(`[bulk] 复用已有实体 ${list.length - toCreate.length} · 需新建 ${toCreate.length}`);

// ② 别名冲突预检（同国同别名已指向别的实体）
let conflicts = 0;
const conflictKeys = new Set<string>();
for (const [country, arr] of byCountry) {
  for (const chunk of chunkOf(arr)) {
    const [found] = await pool.query<RowDataPacket[]>(
      `SELECT alias_key, buyer_id FROM buyer_alias
        WHERE alias_key IN (${chunk.map((r) => "?").join(",")})`,
      chunk.map((r) => sha(`${country}|${r.name}`)),
    );
    const owner = new Map<string, number>();
    for (const f of found) owner.set(String(f.alias_key), Number(f.buyer_id));
    for (const r of chunk) {
      const key = sha(`${country}|${r.name}`);
      const bid = owner.get(key);
      const target = existing.get(`${country}|${r.name.toLowerCase()}`);
      if (bid != null && bid !== target) { conflicts += 1; conflictKeys.add(`${country}|${r.name}`); }
    }
  }
}
console.log(`[bulk] 别名冲突 ${conflicts}（这些名字只建实体、不抢别名）`);

if (!APPLY) {
  console.log("[bulk] DRY：未写库（加 --apply 生效）");
  await pool.end();
  process.exit(0);
}

const conn = await pool.getConnection();
let created = 0;
try {
  // ③ 批量建档（entity_key 唯一；并发撞键时退化为更新中文名）
  for (const [country, arr] of byCountry) {
    const todo = arr.filter((r) => !existing.has(`${country}|${r.name.toLowerCase()}`));
    for (const chunk of chunkOf(todo, 200)) {
      await conn.query(
        `INSERT INTO buyer (entity_key, canonical_name, country_code, name_zh, status, created_at, updated_at)
         VALUES ${chunk.map(() => "(?, ?, ?, ?, 'active', NOW(), NOW())").join(",")}
         ON DUPLICATE KEY UPDATE name_zh = COALESCE(NULLIF(name_zh, ''), VALUES(name_zh)), updated_at = NOW()`,
        chunk.flatMap((r) => [sha(`${country}|${r.name.toLowerCase()}`), r.name, country, r.zh]),
      );
      created += chunk.length;
    }
  }
  // 回查新实体 id
  for (const [country, arr] of byCountry) {
    for (const chunk of chunkOf(arr)) {
      const [found] = await conn.query<RowDataPacket[]>(
        `SELECT buyer_id, canonical_name FROM buyer
          WHERE country_code = ? AND canonical_name IN (${chunk.map(() => "?").join(",")})`,
        [country, ...chunk.map((r) => r.name)],
      );
      for (const f of found) existing.set(`${country}|${String(f.canonical_name).toLowerCase()}`, Number(f.buyer_id));
    }
  }

  // ④ 批量写别名（IGNORE：撞键不覆盖）
  const aliasRows: Array<[string, number, string, string]> = [];
  for (const r of list) {
    const bid = existing.get(`${r.country}|${r.name.toLowerCase()}`);
    if (!bid || conflictKeys.has(`${r.country}|${r.name}`)) continue;
    aliasRows.push([sha(`${r.country}|${r.name}`), bid, r.name, r.country]);
  }
  for (const chunk of chunkOf(aliasRows, 300)) {
    await conn.query(
      `INSERT IGNORE INTO buyer_alias (alias_key, buyer_id, alias, country_code, source, created_at)
       VALUES ${chunk.map(() => "(?, ?, ?, ?, 'bulk', NOW())").join(",")}`,
      chunk.flat(),
    );
  }

  // ⑤ 候选置 merged + 回填 suggested_buyer_id（临时表 JOIN）
  await conn.query(`CREATE TEMPORARY TABLE IF NOT EXISTS tmp_buyer_map (
      country_code char(2) NOT NULL, raw_name varchar(500) NOT NULL, buyer_id bigint unsigned NOT NULL,
      KEY ix_tmp (country_code, raw_name(191))) ENGINE=InnoDB`);
  await conn.query(`TRUNCATE TABLE tmp_buyer_map`);
  const mapRows = list
    .map((r) => [r.country, r.name, existing.get(`${r.country}|${r.name.toLowerCase()}`) ?? 0])
    .filter((x) => Number(x[2]) > 0);
  for (const chunk of chunkOf(mapRows, 500)) {
    await conn.query(
      `INSERT INTO tmp_buyer_map (country_code, raw_name, buyer_id) VALUES ${chunk.map(() => "(?, ?, ?)").join(",")}`,
      chunk.flat(),
    );
  }
  const [merged] = await conn.query<RowDataPacket[]>(
    `UPDATE buyer_candidate c JOIN tmp_buyer_map m
        ON m.country_code = c.country_code AND (m.raw_name = c.raw_name OR m.raw_name = c.normalized_name)
        SET c.status = 'merged', c.suggested_buyer_id = m.buyer_id`,
  );
  console.log(`[bulk] 建实体 ${created} · 写别名 ${aliasRows.length} · 合并候选 ${Number((merged as { affectedRows?: number }).affectedRows ?? 0)}`);
} finally {
  conn.release();
}

// ⑥ 受影响公告 → 重建投影
const names = list.map((r) => r.name);
const noticeIds: number[] = [];
for (const chunk of chunkOf(names, 300)) {
  const [found] = await pool.query<RowDataPacket[]>(
    `SELECT notice_pk FROM notice_public
      WHERE buyer_id IS NULL AND TRIM(buyer_name) IN (${chunk.map(() => "?").join(",")})`,
    chunk,
  );
  for (const f of found) noticeIds.push(Number(f.notice_pk));
}
console.log(`[bulk] 待重建公告 ${noticeIds.length} 条`);
if (noticeIds.length > 0) {
  const r = await refreshBuyerProjection(pool, { noticeIds });
  console.log(`[bulk] 服务表 ${r.rewritten} · 宽表 ${r.wideSynced}`);
  const m = await syncNoticeIds(pool, noticeIds);
  console.log(`[bulk] Meili：写入 ${m.synced} · 删除 ${m.deleted}`);
}

// 收尾统计是「锦上添花」：隧道断在这里不该把整轮落库判成失败
try {
  const [[after]] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) n FROM notice_public WHERE buyer_id IS NULL AND buyer_name IS NOT NULL AND buyer_name <> ''`,
  );
  console.log(`[bulk] 剩余未匹配公告 ${Number(after.n)} 条`);
} catch (e) {
  console.warn(`[bulk] 收尾统计失败（不影响已落库数据）: ${(e as Error).message}`);
}
if (skipped.length > 0) console.log(`[bulk] 预检跳过样例：${skipped.slice(0, 5).join(" | ")}`);
await pool.end();
