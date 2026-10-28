/**
 * Contratación del Estado 结构化正文补采。
 * 该平台详情页没有完整叙事正文，只有对象/预算/CPV/地点/截止等结构化字段。
 * 这里只把这些源字段拼成事实型摘要，标记为 thin，不冒充实质正文。
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    WHERE platform_name='Contratación del Estado'
      AND ((deadline_state='known' AND deadline_ts>=UNIX_TIMESTAMP(NOW())) OR deadline_state='unknown')
      AND content_level IN ('empty','echo','thin')
      AND NOT EXISTS (SELECT 1 FROM notice_body b WHERE b.notice_pk=notice_public.notice_pk AND b.body_source='spain-structured')
    ORDER BY is_opportunity DESC, notice_pk DESC
    LIMIT ?`,
  [LIMIT],
);
console.log(`targets=${(rows as unknown[]).length}`);

const FIELDS: Array<[string, string]> = [
  ["Expediente", "Expediente"],
  ["ObjetoContrato", "Objeto"],
  ["Presupuesto", "Presupuesto"],
  ["ValorContrato", "Valor estimado"],
  ["CPV", "CPV"],
  ["LugarEjecucion", "Lugar de ejecución"],
  ["FechaPresentacionOferta", "Fecha límite"],
  ["Procedimiento", "Procedimiento"],
  ["TipoContrato", "Tipo de contrato"],
];
let ok = 0;
let failed = 0;
let written = 0;
for (const r of rows as Array<Record<string, unknown>>) {
  const id = Number(r.notice_pk);
  try {
    const tmp = join(tmpdir(), `spain-${id}.html`);
    execFileSync("curl.exe", ["-sS", "-L", "--ssl-no-revoke", "--max-time", "30", "-A", "supply-os-spain-backfill/1.0", "-o", tmp, String(r.source_url)], { stdio: "ignore" });
    const $ = cheerio.load(readFileSync(tmp, "utf8"));
    const lines: string[] = [];
    for (const [suffix, label] of FIELDS) {
      const el = $(`[id$=":form1:text_${suffix}"]`).first();
      const val = (el.attr("title") || el.text() || "").replace(/\s+/g, " ").trim();
      if (val && val.length > 1) lines.push(`${label}: ${val}`);
    }
    const body = lines.join("\n");
    if (body.length < 41) { failed++; console.log(id, "skip body<41"); continue; }
    if (APPLY) {
      await c.query(
        `INSERT INTO notice_body (notice_pk,body_text,body_chars,body_source,content_level)
         VALUES (?,?,?, 'spain-structured', 'thin')
         ON DUPLICATE KEY UPDATE body_text=VALUES(body_text), body_chars=VALUES(body_chars),
           body_source=VALUES(body_source), content_level=VALUES(content_level)`,
        [id, body, body.length],
      );
      written++;
    }
    ok++;
    console.log(id, body.length);
  } catch (e) {
    failed++;
    console.log(id, "ERR", (e as Error).message);
  }
}
console.log({ targets: (rows as unknown[]).length, ok, failed, written });
await c.end();

