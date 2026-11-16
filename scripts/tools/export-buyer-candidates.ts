/**
 * 导出待翻译的买家候选（批量翻译批次的输入）
 *
 * @module scripts/tools/export-buyer-candidates
 * @description 从 buyer_candidate 取 pending 候选，输出 `国家\t出现次数\t原名` TSV；
 *              按 --chunk 拆分 part-NN.tsv，供批量翻译后走 merge / apply。
 *
 * 用法：
 *   npx tsx scripts/tools/export-buyer-candidates.ts --out=temp/agent-seed-new/batch.tsv --limit=50
 *   npx tsx scripts/tools/export-buyer-candidates.ts --out=temp/agent-seed-new/batch.tsv --since-days=3 --chunk=500
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import mysql, { type RowDataPacket } from "mysql2/promise";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const arg = (key: string, fallback: string): string =>
  (process.argv.find((a) => a.startsWith(`--${key}=`)) ?? "").split("=")[1] || fallback;
const OUT = arg("out", "temp/buyer-candidate-batch.tsv");
const LIMIT = Math.max(0, Number(arg("limit", "0")));
const SINCE_DAYS = Math.max(0, Number(arg("since-days", "3")));
const CHUNK = Math.max(0, Number(arg("chunk", "0")));
const COUNTRY = arg("country", "").toUpperCase().slice(0, 2);

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: "utf8mb4",
  connectionLimit: 2,
});

try {
  const where = ["status = 'pending'", "raw_name <> ''"];
  const params: unknown[] = [];
  if (SINCE_DAYS > 0) {
    where.push("first_seen_at >= DATE_SUB(NOW(), INTERVAL ? DAY)");
    params.push(SINCE_DAYS);
  }
  if (COUNTRY) {
    where.push("country_code = ?");
    params.push(COUNTRY);
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT country_code, occurrence_count,
            TRIM(REGEXP_REPLACE(raw_name, '[[:space:]]+', ' ')) AS clean_name
       FROM buyer_candidate
      WHERE ${where.join(" AND ")}
      ORDER BY occurrence_count DESC, first_seen_at DESC
      ${LIMIT > 0 ? `LIMIT ${LIMIT}` : ""}`,
    params,
  );
  const lines = rows
    .map((r) => `${r.country_code ?? ""}\t${r.occurrence_count ?? 0}\t${String(r.clean_name ?? "").trim()}`)
    .filter((line) => line.split("\t")[2]);

  mkdirSync(dirname(OUT), { recursive: true });
  if (CHUNK > 0) {
    for (let i = 0; i < lines.length; i += CHUNK) {
      const part = String(Math.floor(i / CHUNK) + 1).padStart(2, "0");
      const path = OUT.replace(/\.tsv$/, `-part-${part}.tsv`);
      writeFileSync(path, lines.slice(i, i + CHUNK).join("\n") + "\n", "utf8");
      console.log(`[export] ${path}: ${Math.min(CHUNK, lines.length - i)} 行`);
    }
  } else {
    writeFileSync(OUT, lines.join("\n") + (lines.length ? "\n" : ""), "utf8");
    console.log(`[export] ${OUT}: ${lines.length} 行`);
  }
  console.log(`[export] pending=${rows.length} · since=${SINCE_DAYS || "all"} 天 · country=${COUNTRY || "all"}`);
} finally {
  await pool.end();
}
