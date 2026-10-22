/**
 * TED 正文补采（官方 v3 JSON API，不抓 HTML、不调 LLM）。
 * 仅补活跃 empty/echo/thin 的 TED 公告，写入 crm_notice_body，随后由 notice-public-v2 刷新。
 *
 * 用法：
 *   npx tsx scripts/tools/ted-backfill.ts --limit=20 --dry-run
 *   npx tsx scripts/tools/ted-backfill.ts --limit=20 --apply
 */
import { readFileSync } from "node:fs";
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
     FROM crm_notice_public
    WHERE source_url LIKE 'https://ted.europa.eu/%'
      AND ((deadline_state='known' AND deadline_ts>=UNIX_TIMESTAMP(NOW())) OR deadline_state='unknown')
      AND content_level IN ('empty','echo','thin')
    ORDER BY is_opportunity DESC, notice_pk DESC
    LIMIT ?`,
  [LIMIT],
);
console.log(`targets=${(rows as unknown[]).length}`);

function pickText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(pickText).filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (obj.eng) return pickText(obj.eng);
    for (const v of Object.values(obj)) {
      const t = pickText(v);
      if (t) return t;
    }
  }
  return "";
}

let ok = 0;
let failed = 0;
let written = 0;
for (const r of rows as Array<Record<string, unknown>>) {
  const id = Number(r.notice_pk);
  const url = String(r.source_url ?? "");
  const pub = url.match(/detail\/(\d+-\d+)/)?.[1];
  if (!pub) { failed++; console.log(id, "skip no publication-number"); continue; }
  try {
    const res = await fetch("https://api.ted.europa.eu/v3/notices/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `publication-number=${pub}`,
        fields: ["publication-number", "notice-title", "description-lot", "description-proc"],
        limit: 1,
        scope: "ALL",
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json() as { notices?: Array<Record<string, unknown>> };
    const n = json.notices?.[0];
    if (!n) throw new Error("no notice");
    const parts = [pickText(n["description-lot"]), pickText(n["description-proc"]), pickText(n["notice-title"])]
      .filter(Boolean)
      .filter((v, i, a) => a.findIndex((x) => x.trim() === v.trim()) === i);
    const body = parts.join("\n\n").trim();
    if (body.length < 41) { failed++; console.log(id, "skip body<41", pub); continue; }
    const level = body.length >= 300 ? "substantive" : "thin";
    if (APPLY) {
      await c.query(
        `INSERT INTO crm_notice_body (notice_pk,body_text,body_chars,body_source,content_level)
         VALUES (?,?,?, 'ted-api', ?)
         ON DUPLICATE KEY UPDATE body_text=VALUES(body_text), body_chars=VALUES(body_chars),
           body_source=VALUES(body_source), content_level=VALUES(content_level)`,
        [id, body, body.length, level],
      );
      written++;
    }
    ok++;
    console.log(id, level, body.length, pub);
  } catch (e) {
    failed++;
    console.log(id, "ERR", (e as Error).message, pub);
  }
}
console.log({ targets: (rows as unknown[]).length, ok, failed, written });
await c.end();
