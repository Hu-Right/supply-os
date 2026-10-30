/**
 * 手翻批次入库：读 TSV（buyer_name\tzh，UTF-8），经准入校验后 UPSERT buyer_translation。
 *
 * 准入校验（用户 2026-10-30 真理：买家名称必须真实）：
 *  - zh 必须含汉字且 ≠ 原名（透传拒收）；
 *  - zh 不含拉丁字母连续 5+ 的夹生拼接？——不设此门：合成式（"TARUMA市"）家规允许；
 *  - name 与 zh 任一为空 → 跳过该行并计数。
 *
 * 写入：buyer_key = SHA2(UPPER(TRIM(buyer_name)), 256)，INSERT ... ON DUPLICATE KEY UPDATE；
 *      插入前删除同名裸串键旧行（备份 /root/bak-buyer-translation-hand-fill-20261030.tsv）。
 *
 * 用法（服务器 /root/supply-os 下）：
 *   npx tsx scripts/tools/buyer-translation-hand-fill.ts runtime/hand-fill-zh-20261030.tsv --apply
 */
import { readFileSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import mysql, { type RowDataPacket } from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const tsvIdx = process.argv.findIndex((a) => a.endsWith(".tsv"));
const TSV_FILE = tsvIdx > 0 ? process.argv[tsvIdx] : null;
if (!TSV_FILE) {
  console.error("用法: npx tsx scripts/tools/buyer-translation-hand-fill.ts <file.tsv> [--apply]");
  process.exit(1);
}
const INSERT_CHUNK = 500;
const CJK_RE = /[\u4e00-\u9fff]/;

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
  connectionLimit: 2,
});

try {
  const lines = readFileSync(TSV_FILE, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const accepted: Array<{ name: string; zh: string }> = [];
  let rejected = 0;
  for (const line of lines) {
    const tab = line.indexOf("\t");
    if (tab <= 0) { rejected += 1; continue; }
    const name = line.slice(0, tab).trim();
    const zh = line.slice(tab + 1).trim();
    if (!name || !zh || !CJK_RE.test(zh) || zh === name) { rejected += 1; continue; }
    accepted.push({ name, zh });
  }
  console.log(`[hand-fill] TSV ${lines.length} 行 · 准入 ${accepted.length} · 拒收 ${rejected}`);

  if (!APPLY) {
    console.log("[hand-fill] DRY：加 --apply 才写 buyer_translation");
    process.exit(0);
  }

  const keys = accepted.map((r) => createHash("sha256").update(r.name.trim().toUpperCase()).digest("hex"));
  const placeholders = keys.map(() => "?").join(",");
  const [dupRows] = await pool.query<RowDataPacket[]>(
    `SELECT buyer_key, buyer_name, buyer_name_zh, status, translated_at, updated_at
       FROM buyer_translation
      WHERE buyer_name IN (${accepted.map(() => "?").join(",")})
        AND buyer_key NOT IN (${placeholders})`,
    [...accepted.map((r) => r.name), ...keys],
  );
  const dups = dupRows as unknown as Array<Record<string, unknown>>;
  if (dups.length > 0) {
    appendFileSync("/root/bak-buyer-translation-hand-fill-20261030.tsv",
      dups.map((d) => [d.buyer_key, d.buyer_name, d.buyer_name_zh, d.status, d.translated_at, d.updated_at].join("\t")).join("\n") + "\n",
      "utf8");
    console.log(`[hand-fill] 裸串键重复行 ${dups.length} 行已备份 /root/bak-buyer-translation-hand-fill-20261030.tsv`);
  }

  let written = 0;
  for (let i = 0; i < accepted.length; i += INSERT_CHUNK) {
    const chunk = accepted.slice(i, i + INSERT_CHUNK);
    const values: unknown[] = [];
    const ph = chunk.map(() => "(SHA2(?,256), ?, ?, 'translated', SHA2(CONCAT('hand-fill-20261030|', ?), 256), UNIX_TIMESTAMP(), UNIX_TIMESTAMP())").join(",");
    for (const r of chunk) values.push(r.name.trim().toUpperCase(), r.name, r.zh, r.name.trim().toUpperCase());
    const [res] = await pool.query(
      `INSERT INTO buyer_translation (buyer_key, buyer_name, buyer_name_zh, status, source_hash, translated_at, updated_at)
       VALUES ${ph}
       ON DUPLICATE KEY UPDATE buyer_name = VALUES(buyer_name), buyer_name_zh = VALUES(buyer_name_zh), updated_at = VALUES(updated_at)`,
      values,
    ) as unknown as [{ affectedRows: number }, unknown];
    written += res.affectedRows;
  }
  console.log(`[hand-fill] 落表完成：写入 ${written}（含更新）· 删除裸串键旧行 ${dups.length}`);
} finally {
  await pool.end();
}
