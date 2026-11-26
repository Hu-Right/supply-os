/**
 * 证书持有收口（2026-11-26）
 *
 * 目标：证书只认 supplier_certifications(150)；企业持有 = supplier.certification_tags（编码）
 *      + supplier.certification_meta（编码 → {validUntil,noExpiry} 有效期）。
 *      enterprise_capability_items 里的认证记录并入后即可退役（删表需门户代码切换上线后执行）。
 *
 * 安全：只做「并集 + 补 meta」，不删除任何现有 tag；写前备份到 /root/bak-supplier-cert-20261126.jsonl。
 *
 * 用法（/root/supply-os 下）：
 *   npx tsx scripts/tools/merge-capability-certs-to-tags.ts            # DRY
 *   npx tsx scripts/tools/merge-capability-certs-to-tags.ts --apply    # 落库
 */
import { readFileSync, writeFileSync } from "node:fs";
import mysql, { type RowDataPacket } from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const BACKUP = "/root/bak-supplier-cert-20261126.jsonl";

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

// 0) 补 meta 列（幂等）
const [cols] = await pool.query<RowDataPacket[]>(
  "SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'supplier' AND column_name = 'certification_meta'",
);
const hasMeta = cols.length > 0;
if (!hasMeta) {
  if (APPLY) {
    await pool.query("ALTER TABLE supplier ADD COLUMN certification_meta JSON NULL COMMENT '证书有效期等元数据：{code:{validUntil,noExpiry}}'");
    console.log("[schema] supplier.certification_meta 已新增");
  } else {
    console.log("[schema] 需要新增 supplier.certification_meta（--apply 时执行）");
  }
}

// 1) 载入 capability 认证记录
const [caps] = await pool.query<RowDataPacket[]>(
  `SELECT enterprise_id, JSON_UNQUOTE(JSON_EXTRACT(value_json,'$.code')) code,
          JSON_UNQUOTE(JSON_EXTRACT(value_json,'$.validUntil')) valid_until,
          JSON_EXTRACT(value_json,'$.noExpiry') no_expiry
     FROM enterprise_capability_items
    WHERE capability_type = 'certification'
    ORDER BY enterprise_id, id`,
);
console.log(`[read] capability 认证记录 ${caps.length} 条，覆盖 ${new Set(caps.map((r) => Number(r.enterprise_id))).size} 家企业`);

// 2) 按企业聚合
const byEnt = new Map<number, Array<Record<string, unknown>>>();
for (const r of caps) {
  const id = Number(r.enterprise_id);
  if (!byEnt.has(id)) byEnt.set(id, []);
  byEnt.get(id)!.push(r);
}

const ids = [...byEnt.keys()];
const [suppliers] = await pool.query<RowDataPacket[]>(
  `SELECT id, certification_tags, ${hasMeta ? "certification_meta" : "NULL AS certification_meta"} FROM supplier WHERE id IN (${ids.map(() => "?").join(",")})`,
  ids,
);
const supMap = new Map(suppliers.map((s) => [Number(s.id), s]));

const backup: string[] = [];
let changed = 0;
for (const [entId, rows] of byEnt) {
  const sup = supMap.get(entId);
  if (!sup) { console.warn(`[warn] supplier ${entId} 不存在，跳过`); continue; }
  const rawTags = sup.certification_tags;
  const existing: string[] = Array.isArray(rawTags)
    ? rawTags.map((t: unknown) => String(t))
    : (() => { try { const p = JSON.parse(String(rawTags ?? "[]")); return Array.isArray(p) ? p.map((t) => String(t)) : []; } catch { return []; } })();
  const existingMeta: Record<string, unknown> = (() => {
    try { const p = JSON.parse(String(sup.certification_meta ?? "{}")); return p && typeof p === "object" ? p as Record<string, unknown> : {}; } catch { return {}; }
  })();

  const tags = new Set(existing);
  const meta: Record<string, unknown> = { ...existingMeta };
  for (const r of rows) {
    const code = String(r.code ?? "").trim();
    if (!code) continue;
    tags.add(code);
    meta[code] = {
      validUntil: r.valid_until == null || r.valid_until === "null" ? null : String(r.valid_until),
      noExpiry: r.no_expiry === 1 || r.no_expiry === true,
    };
  }
  const nextTags = [...tags];
  const nextMeta = JSON.stringify(meta);
  const changedHere = nextTags.length !== existing.length || nextMeta !== JSON.stringify(existingMeta);
  if (!changedHere) continue;
  changed += 1;
  backup.push(JSON.stringify({ id: entId, before_tags: existing, before_meta: existingMeta, after_tags: nextTags, after_meta: meta }));
  console.log(`[plan] supplier ${entId}: tags ${existing.length}→${nextTags.length} · meta +${Object.keys(meta).length - Object.keys(existingMeta).length}`);
  if (APPLY) {
    await pool.execute(
      "UPDATE supplier SET certification_tags = ?, certification_meta = ? WHERE id = ?",
      [JSON.stringify(nextTags), nextMeta, entId],
    );
  }
}

writeFileSync(BACKUP, backup.join("\n") + (backup.length ? "\n" : ""), "utf8");
console.log(`[backup] ${backup.length} 家写入 ${BACKUP}`);
console.log(APPLY ? `[apply] 已更新 ${changed} 家企业` : `[dry] 待更新 ${changed} 家（加 --apply 落库）`);

await pool.end();
