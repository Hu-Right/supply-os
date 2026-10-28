/**
 * UNGM 正文补采（页面固定结构，不调 LLM）。
 * 仅补活跃 empty/echo/thin 的 UNGM 公告，写入 notice_body。
 *
 * 用法：
 *   npx tsx scripts/tools/ungm-backfill.ts --limit=20 --dry-run
 *   npx tsx scripts/tools/ungm-backfill.ts --limit=20 --apply
 */
import { readFileSync } from "node:fs";
import * as cheerio from "cheerio";
import mysql from "mysql2/promise";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const APPLY = process.argv.includes("--apply");
const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit=")) ?? "").split("=")[1] || 20);
const c = await mysql.createConnection({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm",
  charset: "utf8mb4",
});
const [rows] = await c.query(
  `SELECT notice_pk, source_url, title, content_level
     FROM notice_public
    WHERE source_url LIKE '%ungm.org/Public/Notice/%'
      AND ((deadline_state='known' AND deadline_ts>=UNIX_TIMESTAMP(NOW())) OR deadline_state='unknown')
      AND content_level IN ('empty','echo','thin')
      AND NOT EXISTS (SELECT 1 FROM notice_body b WHERE b.notice_pk=notice_public.notice_pk AND b.body_source='ungm')
    ORDER BY is_opportunity DESC, notice_pk DESC
    LIMIT ?`,
  [LIMIT],
);
console.log(`targets=${(rows as unknown[]).length}`);

let ok = 0;
let failed = 0;
let written = 0;
for (const r of rows as Array<Record<string, unknown>>) {
  const id = Number(r.notice_pk);
  const url = String(r.source_url ?? "");
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "supply-os-ungm-backfill/1.0 (+data quality)", accept: "text/html" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    let body = "";
    $(".title").each((_, el) => {
      const label = $(el).text().trim().toLowerCase();
      if (label !== "description") return;
      const content = $(el).next("div").text().replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
      if (content.length > body.length) body = content;
    });
    if (body.length < 41) { failed++; console.log(id, "skip body<41", url); continue; }
    const level = body.length >= 300 ? "substantive" : "thin";
    if (APPLY) {
      await c.query(
        `INSERT INTO notice_body (notice_pk,body_text,body_chars,body_source,content_level)
         VALUES (?,?,?, 'ungm', ?)
         ON DUPLICATE KEY UPDATE body_text=VALUES(body_text), body_chars=VALUES(body_chars),
           body_source=VALUES(body_source), content_level=VALUES(content_level)`,
        [id, body, body.length, level],
      );
      written++;
    }
    ok++;
    console.log(id, level, body.length);
  } catch (e) {
    failed++;
    console.log(id, "ERR", (e as Error).message);
  }
}
console.log({ targets: (rows as unknown[]).length, ok, failed, written });
await c.end();
