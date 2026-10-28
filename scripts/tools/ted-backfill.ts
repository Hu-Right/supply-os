/**
 * TED 正文补采（官方 v3 JSON API，不抓 HTML、不调 LLM）。
 * 仅补活跃 empty/echo/thin 的 TED 公告，写入 notice_body，随后由 notice-public-v2 刷新。
 *
 * 用法：
 *   npx tsx scripts/tools/ted-backfill.ts --limit=100 --dry-run
 *   npx tsx scripts/tools/ted-backfill.ts --limit=5119 --batch=50 --apply
 */
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const APPLY = process.argv.includes("--apply");
const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit=")) ?? "").split("=")[1] || 20);
const BATCH = Math.min(Number((process.argv.find((a) => a.startsWith("--batch=")) ?? "").split("=")[1] || 50), 100);
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
    WHERE source_url LIKE 'https://ted.europa.eu/%'
      AND ((deadline_state='known' AND deadline_ts>=UNIX_TIMESTAMP(NOW())) OR deadline_state='unknown')
      AND content_level IN ('empty','echo','thin')\n      AND NOT EXISTS (SELECT 1 FROM notice_body b WHERE b.notice_pk=notice_public.notice_pk AND b.body_source='ted-api')
    ORDER BY is_opportunity DESC, notice_pk DESC
    LIMIT ?`,
  [LIMIT],
);
const targets = (rows as Array<Record<string, unknown>>).map((r) => ({
  id: Number(r.notice_pk),
  pub: String(r.source_url ?? "").match(/detail\/(\d+-\d+)/)?.[1] ?? "",
  level: String(r.content_level ?? ""),
}));
console.log(`targets=${targets.length} batch=${BATCH}`);

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
for (let i = 0; i < targets.length; i += BATCH) {
  const chunk = targets.slice(i, i + BATCH).filter((x) => x.pub);
  if (!chunk.length) continue;
  const query = chunk.map((x) => `publication-number=${x.pub}`).join(" OR ");
  try {
    const res = await fetch("https://api.ted.europa.eu/v3/notices/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query,
        fields: ["publication-number", "notice-title", "description-lot", "description-proc"],
        limit: Math.min(chunk.length, 100),
        scope: "ALL",
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json() as { notices?: Array<Record<string, unknown>> };
    const byPub = new Map<string, Record<string, unknown>>();
    for (const n of json.notices ?? []) byPub.set(String(n["publication-number"]), n);
    for (const t of chunk) {
      const n = byPub.get(t.pub);
      if (!n) { failed++; console.log(t.id, "no notice", t.pub); continue; }
      const parts = [pickText(n["description-lot"]), pickText(n["description-proc"]), pickText(n["notice-title"])]
        .filter(Boolean)
        .filter((v, idx, a) => a.findIndex((x) => x.trim() === v.trim()) === idx);
      const body = parts.join("\n\n").trim();
      if (body.length < 41) { failed++; console.log(t.id, "skip body<41", t.pub); continue; }
      const level = body.length >= 300 ? "substantive" : "thin";
      if (APPLY) {
        await c.query(
          `INSERT INTO notice_body (notice_pk,body_text,body_chars,body_source,content_level)
           VALUES (?,?,?, 'ted-api', ?)
           ON DUPLICATE KEY UPDATE body_text=VALUES(body_text), body_chars=VALUES(body_chars),
             body_source=VALUES(body_source), content_level=VALUES(content_level)`,
          [t.id, body, body.length, level],
        );
        written++;
      }
      ok++;
    }
    console.log(`batch ${i + 1}-${i + chunk.length} ok=${ok} failed=${failed}`);
  } catch (e) {
    failed += chunk.length;
    console.log(`batch ${i + 1}-${i + chunk.length} ERR ${(e as Error).message}`);
  }
}
console.log({ targets: targets.length, ok, failed, written });
await c.end();

