/**
 * 买家实体归一修复（重复实体合并 / 通用词别名清理 / 候选自动挂靠）
 *
 * @module scripts/tools/buyer-normalize-repair
 * @description 2026-11-23 积压处理。三类问题：
 *              ① 同国 + 同归一名存在多个 buyer 实体（历史批次重复建档）→ 合并到公告数最多的实体；
 *              ② 别名是「Compras / Contratación / Gestión Contractual」这类通用词，被挂到
 *                任意机构上，造成同键冲突 → 删除（仅当它不等于该实体自己的规范名）；
 *              ③ buyer_candidate 里归一后能**全局唯一**命中某实体 canonical 的候选 →
 *                直接补 buyer_alias 并置 merged（不新建实体，符合「宁缺毋假」）。
 *
 *              不处理：需要新建实体的候选（无 canonical 命中）与缺中文名——另行批量翻译/人工。
 *
 * 用法：
 *   npx tsx scripts/tools/buyer-normalize-repair.ts            # DRY
 *   npx tsx scripts/tools/buyer-normalize-repair.ts --apply    # 落库（先自动备份三张表）
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import { normalizeBuyerKey } from "../../src/lib/services/buyer/normalize";

const APPLY = process.argv.includes("--apply");
const BACKUP_SUFFIX = new Date().toISOString().slice(0, 10).replace(/-/g, "");

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const sha = (s: string): string => createHash("sha256").update(s).digest("hex");
const cc = (v: unknown): string => String(v ?? "").trim().toUpperCase();

const pool: Pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: "utf8mb4",
  connectionLimit: 4,
});

/** 通用采购词：不是机构名，挂在任何实体上都只会制造错误匹配 */
const GENERIC_ALIASES = new Set([
  "COMPRAS", "COMPRA", "COMPRAS PUBLICAS", "COMPRAS PÚBLICAS",
  "CONTRATACION", "CONTRATACIONES", "CONTRATACIÓN",
  "GESTION CONTRACTUAL", "GESTIÓN CONTRACTUAL",
  "JURIDICA", "JURÍDICA", "LICITACION", "LICITACIONES",
  "ADQUISICIONES", "SUBASTA", "SUBASTAS", "PROVEEDORES", "PROVEEDOR",
]);

async function backup(): Promise<void> {
  for (const t of ["buyer", "buyer_alias", "buyer_candidate"]) {
    await pool.query(`CREATE TABLE IF NOT EXISTS \`${t}_bak_${BACKUP_SUFFIX}\` AS SELECT * FROM \`${t}\``);
    console.log(`[backup] ${t}_bak_${BACKUP_SUFFIX}`);
  }
}

async function main(): Promise<void> {
  if (APPLY) await backup();

  // ── ① 重复实体合并 ──────────────────────────────────────────────
  const [buyers] = await pool.query<RowDataPacket[]>(
    "SELECT buyer_id, canonical_name, country_code FROM buyer WHERE status = 'active'",
  );
  const groups = new Map<string, Array<{ id: number; canonical: string }>>();
  for (const b of buyers) {
    const key = `${cc(b.country_code)}|${normalizeBuyerKey(b.canonical_name)}`;
    const arr = groups.get(key) ?? [];
    arr.push({ id: Number(b.buyer_id), canonical: String(b.canonical_name) });
    groups.set(key, arr);
  }
  const dupGroups = [...groups.entries()].filter(([, arr]) => arr.length > 1);

  let merged = 0;
  for (const [, arr] of dupGroups) {
    const ids = arr.map((x) => x.id);
    const [counts] = await pool.query<RowDataPacket[]>(
      `SELECT buyer_id, COUNT(*) AS c FROM notice_public WHERE buyer_id IN (${ids.map(() => "?").join(",")}) GROUP BY buyer_id`,
      ids,
    );
    const cnt = new Map<number, number>(counts.map((r) => [Number(r.buyer_id), Number(r.c)]));
    const keeper = [...arr].sort((a, b) => (cnt.get(b.id) ?? 0) - (cnt.get(a.id) ?? 0) || a.id - b.id)[0];
    for (const dup of arr) {
      if (dup.id === keeper.id) continue;
      merged += 1;
      if (!APPLY) continue;
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query("UPDATE notice_public SET buyer_id = ? WHERE buyer_id = ?", [keeper.id, dup.id]);
        await conn.query("UPDATE buyer_alias SET buyer_id = ? WHERE buyer_id = ?", [keeper.id, dup.id]);
        await conn.query("UPDATE buyer SET status = 'inactive' WHERE buyer_id = ?", [dup.id]);
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    }
  }
  console.log(`[dedupe] groups=${dupGroups.length} merged=${merged}${APPLY ? "" : " (dry)"}`);

  // ── ② 通用词别名清理 ────────────────────────────────────────────
  const [aliasRows] = await pool.query<RowDataPacket[]>(
    `SELECT a.alias_key, a.alias, a.buyer_id, b.canonical_name
       FROM buyer_alias a JOIN buyer b ON b.buyer_id = a.buyer_id`,
  );
  const genericKeys: string[] = [];
  for (const r of aliasRows) {
    const k = normalizeBuyerKey(r.alias);
    if (!GENERIC_ALIASES.has(k)) continue;
    if (k === normalizeBuyerKey(r.canonical_name)) continue; // 机构真名就叫这个的不动
    genericKeys.push(String(r.alias_key));
  }
  if (APPLY && genericKeys.length) {
    for (let i = 0; i < genericKeys.length; i += 500) {
      const chunk = genericKeys.slice(i, i + 500);
      await pool.query(`DELETE FROM buyer_alias WHERE alias_key IN (${chunk.map(() => "?").join(",")})`, chunk);
    }
  }
  console.log(`[generic-alias] delete=${genericKeys.length}${APPLY ? "" : " (dry)"}`);

  // ── ③ 候选自动挂靠（全局唯一 canonical 命中）────────────────────
  const byCanon = new Map<string, Set<number>>();
  for (const b of buyers) {
    const k = normalizeBuyerKey(b.canonical_name);
    if (!k) continue;
    if (!byCanon.has(k)) byCanon.set(k, new Set());
    byCanon.get(k)!.add(Number(b.buyer_id));
  }
  const [cands] = await pool.query<RowDataPacket[]>(
    "SELECT candidate_key, country_code, raw_name FROM buyer_candidate WHERE status = 'pending'",
  );
  const links: Array<{ key: string; buyerId: number; country: string; raw: string }> = [];
  for (const c of cands) {
    const k = normalizeBuyerKey(c.raw_name);
    const hit = byCanon.get(k);
    if (!hit || hit.size !== 1) continue;
    links.push({
      key: String(c.candidate_key),
      buyerId: [...hit][0],
      country: cc(c.country_code),
      raw: String(c.raw_name),
    });
  }
  if (APPLY && links.length) {
    for (let i = 0; i < links.length; i += 300) {
      const chunk = links.slice(i, i + 300);
      await pool.query(
        `INSERT IGNORE INTO buyer_alias (alias_key, buyer_id, alias, country_code, source)
         VALUES ${chunk.map(() => "(?, ?, ?, ?, 'backfill')").join(",")}`,
        chunk.flatMap((l) => [l.key, l.buyerId, l.raw.slice(0, 500), l.country || null]),
      );
      await pool.query(
        `UPDATE buyer_candidate c
           JOIN buyer_alias a ON a.alias_key = c.candidate_key
            SET c.status = 'merged', c.suggested_buyer_id = a.buyer_id, c.last_seen_at = NOW()
          WHERE c.status = 'pending' AND c.candidate_key IN (${chunk.map(() => "?").join(",")})`,
        chunk.map((l) => l.key),
      );
    }
  }
  console.log(`[link] candidates=${links.length}${APPLY ? "" : " (dry)"}`);

  // ── ④ 剩余候选 / 缺中文名 概览 ─────────────────────────────────
  const [rest] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) c, COALESCE(SUM(occurrence_count),0) occ FROM buyer_candidate WHERE status='pending'",
  );
  const [missingZh] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) c FROM buyer WHERE status='active' AND (name_zh IS NULL OR name_zh='')",
  );
  console.log(`[remaining] candidates=${rest[0].c} occurrences=${rest[0].occ} missing_zh=${missingZh[0].c}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await pool.end(); });
