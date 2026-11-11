/**
 * 宽表 country_codes 存量定向回填（2026-11-11 外科手术版）。
 *
 * 只回填一列：notice_search.country_codes ← notice_public.country_codes
 * （JSON 数组 → 过滤 ^[A-Z]{2}$ → 去重 → 逗号串），与 wide-row-builder.ts 完全同语义。
 * 不走 fullBackfill 全量重投影——8G 机器上与应用对账器互踩（实测 load>10、20 分钟零批）。
 * 指纹列刻意不动：指纹=输入快照哈希，本脚本不改输入，投影输出与构建器等价，指纹仍一致。
 *
 * JSON_VALID 守卫防脏值炸 JSON_TABLE；keyset 分块（5万/块）防长事务。
 * 用法（服务器，cwd=/root/supply-os）：npx tsx scripts/tools/wide-country-update.ts
 */
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";

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
  connectionLimit: 2,
  connectTimeout: 120000,
});

const CHUNK = 50000;
const t0 = Date.now();
let lastId = 0, total = 0, chunks = 0;
const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);

for (;;) {
  const [sel] = await pool.query(
    `SELECT MIN(id) lo, MAX(id) hi, COUNT(*) n FROM (
       SELECT id FROM notice_search WHERE country_codes='' AND id > ? ORDER BY id LIMIT ?
     ) t`, [lastId, CHUNK],
  );
  const { lo, hi, n } = (sel as any[])[0];
  if (!lo) break;

  const [u] = await pool.query(
    `UPDATE notice_search ns JOIN (
       SELECT p.notice_pk pk, GROUP_CONCAT(DISTINCT c.code ORDER BY c.code) cc
       FROM notice_public p
       JOIN JSON_TABLE(p.country_codes, '$[*]' COLUMNS(code VARCHAR(8) PATH '$')) c
       WHERE p.notice_pk BETWEEN ? AND ?
         AND JSON_VALID(p.country_codes) AND p.country_codes <> '' AND p.country_codes <> '[]'
         AND c.code REGEXP '^[A-Z]{2}$'
       GROUP BY p.notice_pk
     ) t ON t.pk = ns.id
     SET ns.country_codes = t.cc
     WHERE ns.country_codes='' AND ns.id BETWEEN ? AND ?`,
    [lo, hi, lo, hi],
  );
  total += (u as any).affectedRows;
  chunks++;
  lastId = hi;
  log(`块 ${chunks}：范围 ${lo}-${hi}（选中 ${n}）· 更新 ${(u as any).affectedRows} · 累计 ${total} · ${Math.round((Date.now() - t0) / 1000)}s`);
  if (n < CHUNK && (u as any).affectedRows === 0 && total > 0) { /* 尾块继续，由 lo 空判退出 */ }
}

log(`完成：${chunks} 块 · 回填 ${total} 行 · 耗时 ${Math.round((Date.now() - t0) / 1000)}s`);
const [chk] = await pool.query(
  `SELECT SUM(country_codes<>'') filled, COUNT(*) total FROM notice_search`,
);
console.log("终态：", JSON.stringify((chk as any[])[0]));
await pool.end();
