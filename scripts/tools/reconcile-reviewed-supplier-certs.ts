/**
 * 已审核供应商的资质字段校准（2026-11-26）
 *
 * 口径：证书只认 supplier_certifications(150)。
 *   - `certification_tags` = 机器可读的规范编码数组（事实源）
 *   - `certification` = 展示文本，规范形态是 tags.join('、')
 *
 * 本脚本对「已审核」供应商（info_review_status='reviewed' 或 verify_status='done'）：
 *   ① tags 有值、text 与 tags 集合不一致 → text 重写为 tags.join('、')（保留 tags 顺序）
 *   ② tags 为空、text 能完整解析成字典编码 → 补 tags，text 规范化为编码串
 *   ③ text 里有无法识别的项 → 只报告，不猜、不改
 *
 * 写前备份；幂等。
 *
 * 用法（/root/supply-os 下）：
 *   npx tsx scripts/tools/reconcile-reviewed-supplier-certs.ts            # DRY
 *   npx tsx scripts/tools/reconcile-reviewed-supplier-certs.ts --apply    # 落库
 */
import { readFileSync, writeFileSync } from "node:fs";
import mysql, { type RowDataPacket } from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const BACKUP = "/root/bak-reviewed-supplier-certs-20261126.jsonl";

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

// 字典：code + 名称 → code
const [dict] = await pool.query<RowDataPacket[]>("SELECT code, name FROM supplier_certifications");
const byCode = new Map<string, string>();
const byName = new Map<string, string>();
for (const r of dict) {
  byCode.set(String(r.code).toUpperCase(), String(r.code));
  byName.set(String(r.name).trim(), String(r.code));
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x));
  try { const p = JSON.parse(String(raw ?? "[]")); return Array.isArray(p) ? p.map((x) => String(x)) : []; } catch { return []; }
}

/** 展示文本 → 编码数组；任一项无法识别返回 null（不猜） */
function textToCodes(text: string): string[] | null {
  const parts = String(text).split(/[、,，;；/|]+/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const code = byCode.get(part.toUpperCase()) ?? byName.get(part);
    if (!code) return null;
    if (!out.includes(code)) out.push(code);
  }
  return out;
}

const [rows] = await pool.query<RowDataPacket[]>(
  `SELECT id, company, certification, certification_tags
     FROM supplier
    WHERE info_review_status = 'reviewed' OR verify_status = 'done'
    ORDER BY id`,
);
console.log(`[read] 已审核供应商 ${rows.length} 家`);

const fixes: Array<{ id: number; company: string; before_text: string | null; before_tags: unknown; next_text: string | null; next_tags: string[] | null; reason: string }> = [];
const unresolved: Array<{ id: number; company: string; text: string }> = [];

for (const r of rows) {
  const id = Number(r.id);
  const text = r.certification == null ? null : String(r.certification).trim();
  const tags = parseTags(r.certification_tags);

  if (tags.length > 0) {
    const canonical = tags.join("、");
    if (text !== canonical) {
      fixes.push({ id, company: String(r.company ?? ""), before_text: text, before_tags: tags, next_text: canonical, next_tags: tags, reason: "text 与 tags 不一致，按 tags 重写展示文本" });
    }
    continue;
  }

  if (text) {
    const codes = textToCodes(text);
    if (!codes) { unresolved.push({ id, company: String(r.company ?? ""), text }); continue; }
    if (codes.length > 0) {
      fixes.push({ id, company: String(r.company ?? ""), before_text: text, before_tags: [], next_text: codes.join("、"), next_tags: codes, reason: "有文本无 tags，按字典补 tags" });
    }
  }
}

console.log(`[plan] 待更新 ${fixes.length} 家 · 无法识别（不动）${unresolved.length} 家`);
for (const f of fixes.slice(0, 10)) console.log(`  #${f.id} ${f.company.slice(0, 18)} :: ${f.reason}`);
for (const u of unresolved.slice(0, 10)) console.log(`  ! #${u.id} ${u.company.slice(0, 18)} :: ${u.text.slice(0, 50)}`);

writeFileSync(BACKUP, fixes.map((f) => JSON.stringify(f)).join("\n") + (fixes.length ? "\n" : ""), "utf8");
console.log(`[backup] ${fixes.length} 家写入 ${BACKUP}`);

if (APPLY) {
  let done = 0;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const f of fixes) {
      await conn.execute(
        "UPDATE supplier SET certification = ?, certification_tags = ? WHERE id = ?",
        [f.next_text, f.next_tags && f.next_tags.length ? JSON.stringify(f.next_tags) : null, f.id],
      );
      done += 1;
    }
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  console.log(`[apply] 已更新 ${done} 家`);
} else {
  console.log("[dry] 加 --apply 落库");
}

await pool.end();
