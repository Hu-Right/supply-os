/**
 * SAM.gov 正文补采（官方 Opportunities description API）。
 * 需要 .env: SAM_API_KEY=...
 *
 * 用法：
 *   npx tsx scripts/tools/sam-backfill.ts --limit=20 --dry-run
 *   npx tsx scripts/tools/sam-backfill.ts --limit=20 --apply
 */
import { readFileSync } from "node:fs";
import * as cheerio from "cheerio";
import mysql from "mysql2/promise";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const KEY = process.env.SAM_API_KEY;
if (!KEY) throw new Error("SAM_API_KEY missing in .env");
const APPLY = process.argv.includes("--apply");
const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit=")) ?? "").split("=")[1] || 20);
const DELAY = Number((process.argv.find((a) => a.startsWith("--delay=")) ?? "").split("=")[1] || 0);
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
    WHERE source_url LIKE '%sam.gov/opp/%'
      AND ((deadline_state='known' AND deadline_ts>=UNIX_TIMESTAMP(NOW())) OR deadline_state='unknown')
      AND content_level IN ('empty','echo','thin')
      AND NOT EXISTS (SELECT 1 FROM notice_body b WHERE b.notice_pk=notice_public.notice_pk AND b.body_source='sam-api')
    ORDER BY is_opportunity DESC, notice_pk DESC
    LIMIT ?`,
  [LIMIT],
);
console.log(`targets=${(rows as unknown[]).length}`);

function htmlToText(html: string): string {
  const $ = cheerio.load(`<div id="sam-body">${html}</div>`);
  const blocks: string[] = [];
  $("#sam-body p, #sam-body li, #sam-body h1, #sam-body h2, #sam-body h3, #sam-body h4").each((_, el) => {
    const t = $(el).text().replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
    if (t) blocks.push(t);
  });
  const text = blocks.length
    ? blocks.join("\n\n")
    : $("#sam-body").text().replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

let ok = 0;
let failed = 0;
let written = 0;
for (const r of rows as Array<Record<string, unknown>>) {
  const id = Number(r.notice_pk);
  const url = String(r.source_url ?? "");
  const noticeId = url.match(/\/opp\/([a-zA-Z0-9]+)/)?.[1];
  if (!noticeId) { failed++; console.log(id, "skip no noticeId"); continue; }
  try {
    const res = await fetch(
      `https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=${noticeId}&api_key=${encodeURIComponent(KEY)}`,
      { signal: AbortSignal.timeout(25_000) },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json() as { description?: string };
    const body = htmlToText(json.description ?? "");
    if (body.length < 41) { failed++; console.log(id, "skip body<41", noticeId); continue; }
    const level = body.length >= 300 ? "substantive" : "thin";
    if (APPLY) {
      await c.query(
        `INSERT INTO notice_body (notice_pk,body_text,body_chars,body_source,content_level)
         VALUES (?,?,?, 'sam-api', ?)
         ON DUPLICATE KEY UPDATE body_text=VALUES(body_text), body_chars=VALUES(body_chars),
           body_source=VALUES(body_source), content_level=VALUES(content_level)`,
        [id, body, body.length, level],
      );
      written++;
    }
    ok++;
    console.log(id, level, body.length, noticeId);
  } catch (e) {
    failed++;
    console.log(id, "ERR", (e as Error).message, noticeId);
  }
  if (DELAY > 0) await new Promise((resolve) => setTimeout(resolve, DELAY));
}
console.log({ targets: (rows as unknown[]).length, ok, failed, written });
await c.end();

