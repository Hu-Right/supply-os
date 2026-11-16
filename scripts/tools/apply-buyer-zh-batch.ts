/**
 * 买家中文名批量落库（聚合翻译批次的最后一步）
 *
 * @module scripts/tools/apply-buyer-zh-batch
 * @description 输入 `原名\t中文名`（可带国家列），把一批已翻译的候选名落成
 *              buyer + buyer_alias，候选置 merged，并刷新受影响公告投影。
 *
 *              设计口径（对齐 ADR-0016 / buyer.normalize）：
 *              - 中文名必须纯中文、非过泛、非原文透传；
 *              - 先按 buyer_alias 复用已有实体，未命中且能确定国家才建新实体；
 *              - 同一别名指向多个实体 = 歧义，跳过并报告，不猜；
 *              - 写入 buyer 后必须走 refreshBuyerProjection，不能直接写 notice_public。
 *
 * 用法：
 *   npx tsx scripts/tools/apply-buyer-zh-batch.ts <file.tsv>            # DRY
 *   npx tsx scripts/tools/apply-buyer-zh-batch.ts <file.tsv> --apply    # 落库
 *   npx tsx scripts/tools/apply-buyer-zh-batch.ts <file.tsv> --apply --limit=100
 *
 * TSV 列：
 *   2 列：原名 \t 中文名
 *   3 列：国家 \t 原名 \t 中文名
 *   4 列：国家 \t 出现次数 \t 原名 \t 中文名
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { isPureChineseBuyerName, isTooGenericBuyerName } from "../../src/lib/services/buyer/normalize";
import { refreshBuyerProjection } from "../../src/lib/services/buyer/refresh";
import { syncNoticeIds } from "../../src/lib/services/meilisearch";

const APPLY = process.argv.includes("--apply");
const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit=")) ?? "").split("=")[1] || 0);
const FILE = process.argv.find((a) => a.endsWith(".tsv"));
if (!FILE) {
  console.error("用法: npx tsx scripts/tools/apply-buyer-zh-batch.ts <file.tsv> [--apply] [--limit=N]");
  process.exit(1);
}

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const sha = (s: string): string => createHash("sha256").update(s).digest("hex");
const norm = (s: string): string => s.normalize("NFKC").replace(/\s+/g, " ").trim();
const stripCode = (s: string): string =>
  s.replace(/^\d{2,}[A-Z0-9]*\s*[-–—]\s*/i, "").trim() || s;
const fixPunct = (s: string): string =>
  s.replace(/[;；]/g, "、").replace(/,/g, "，").replace(/:/g, "：").replace(/\s+/g, " ").trim();

type Row = { country: string; name: string; zh: string; line: number };
type Skipped = { line: number; name: string; reason: string };

function parseRow(line: string, lineNo: number): Row | null {
  const cols = line.split("\t").map((s) => s.trim());
  if (cols.length < 2) return null;
  let country = "";
  let name = "";
  let zh = "";
  if (cols.length === 2) {
    [name, zh] = cols;
  } else if (cols.length === 3) {
    [country, name, zh] = cols;
  } else {
    country = cols[0] ?? "";
    zh = cols[cols.length - 1] ?? "";
    name = cols.slice(2, -1).join(" ");
    if (!name) name = cols[1] ?? "";
    // 兼容 part 格式：国家 出现次数 原名 中文名
    if (/^\d+$/.test(cols[1] ?? "")) name = cols[2] ?? "";
  }
  country = country.toUpperCase().slice(0, 2);
  name = norm(name).slice(0, 500);
  zh = fixPunct(zh).slice(0, 500);
  if (!name || !zh) return null;
  return { country, name, zh, line: lineNo };
}

function validate(row: Row): string | null {
  if (row.zh === row.name) return "译文与原名相同";
  if (!isPureChineseBuyerName(row.zh)) return "译文不是纯中文";
  if (row.zh.length < 2 || row.zh.length > 120) return "译文长度不在 2-120";
  if (isTooGenericBuyerName(row.zh)) return "译文过泛";
  if (/[;；]/.test(row.name)) return "多实体拼接名，需先拆分";
  if (row.name.length > 300) return "原名过长";
  return null;
}

const pool: Pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: "utf8mb4",
  connectionLimit: 2,
});

const rows: Row[] = [];
const skipped: Skipped[] = [];
let lineNo = 0;
for (const line of readFileSync(FILE, "utf8").split(/\r?\n/)) {
  lineNo += 1;
  if (!line.trim()) continue;
  const row = parseRow(line, lineNo);
  if (!row) {
    skipped.push({ line: lineNo, name: line.slice(0, 80), reason: "列不足/空值" });
    continue;
  }
  const reason = validate(row);
  if (reason) {
    skipped.push({ line: lineNo, name: row.name, reason });
    continue;
  }
  rows.push(row);
  if (LIMIT > 0 && rows.length >= LIMIT) break;
}

type Result = {
  created: number;
  reused: number;
  merged: number;
  notices: number;
  conflicts: number;
};

const result: Result = { created: 0, reused: 0, merged: 0, notices: 0, conflicts: 0 };
const noticeIds = new Set<number>();
const noticeNames = new Set<string>();
const report: Array<Record<string, unknown>> = [];

function countryWhere(country: string): { sql: string; params: string[] } {
  return country ? { sql: " AND country_code = ?", params: [country] } : { sql: "", params: [] };
}

async function findBuyerId(conn: PoolConnection, name: string, country: string): Promise<number | "ambiguous" | null> {
  const c = countryWhere(country);
  const [aliasRows] = await conn.query<RowDataPacket[]>(
    `SELECT DISTINCT buyer_id FROM buyer_alias WHERE alias = ?${c.sql} LIMIT 2`,
    [name, ...c.params],
  );
  if (aliasRows.length === 1) return Number(aliasRows[0].buyer_id);
  if (aliasRows.length > 1) return "ambiguous";

  const [buyerRows] = await conn.query<RowDataPacket[]>(
    `SELECT buyer_id FROM buyer WHERE canonical_name = ?${c.sql} LIMIT 2`,
    [name, ...c.params],
  );
  if (buyerRows.length === 1) return Number(buyerRows[0].buyer_id);
  if (buyerRows.length > 1) return "ambiguous";

  if (country) {
    const [keyRows] = await conn.query<RowDataPacket[]>(
      "SELECT buyer_id FROM buyer WHERE entity_key = ? LIMIT 1",
      [sha(`${country}|${name.toLowerCase()}`)],
    );
    if (keyRows.length === 1) return Number(keyRows[0].buyer_id);
  }
  return null;
}

async function ensureAlias(
  conn: PoolConnection,
  buyerId: number,
  name: string,
  country: string,
): Promise<boolean> {
  const aliasKey = sha(`${country}|${name}`);
  const [existing] = await conn.query<RowDataPacket[]>(
    "SELECT buyer_id FROM buyer_alias WHERE alias_key = ? LIMIT 1",
    [aliasKey],
  );
  if (existing.length > 0) {
    if (Number(existing[0].buyer_id) !== buyerId) {
      console.warn(`[batch] 别名冲突 name=${name.slice(0, 60)} 已有 buyer=${existing[0].buyer_id} 目标=${buyerId}`);
      return false;
    }
    return true;
  }
  await conn.query(
    "INSERT INTO buyer_alias (alias_key, buyer_id, alias, country_code, source, created_at) VALUES (?, ?, ?, ?, 'batch', NOW())",
    [aliasKey, buyerId, name, country || null],
  );
  return true;
}

try {
  console.log(`[batch] 读入 ${rows.length} 行，预检跳过 ${skipped.length} 行${APPLY ? "" : "（DRY）"}`);

  const conn = await pool.getConnection();
  const planned = new Map<string, number>();
  try {
    for (const row of rows) {
      const [candidateRows] = await conn.query<RowDataPacket[]>(
        `SELECT country_code, raw_name FROM buyer_candidate
          WHERE country_code <=> ? AND (raw_name = ? OR normalized_name = LOWER(?))
          LIMIT 2`,
        [row.country || null, row.name, row.name],
      );
      let country = row.country;
      let candidateRaw = row.name;
      if (!country && candidateRows.length === 1) {
        country = String(candidateRows[0].country_code ?? "").toUpperCase().slice(0, 2);
        candidateRaw = String(candidateRows[0].raw_name ?? row.name);
      }
      if (candidateRows.length > 1) {
        result.conflicts += 1;
        skipped.push({ line: row.line, name: row.name, reason: "候选同国多行/歧义" });
        continue;
      }

      const canonical = stripCode(row.name);
      const plannedKey = `${country}|${canonical.toLowerCase()}`;
      const plannedId = planned.get(plannedKey);
      let existing: number | "ambiguous" | null =
        plannedId !== undefined ? plannedId : await findBuyerId(conn, row.name, country);
      if (existing == null) existing = await findBuyerId(conn, canonical, country);
      if (existing === "ambiguous") {
        result.conflicts += 1;
        skipped.push({ line: row.line, name: row.name, reason: "已有多个实体指向该名" });
        continue;
      }

      let buyerId = existing;
      let created = false;
      if (buyerId == null) {
        if (!country) {
          skipped.push({ line: row.line, name: row.name, reason: "无法确定国家，不能建实体" });
          continue;
        }
        const entityKey = sha(`${country}|${canonical.toLowerCase()}`);
        if (!APPLY) {
          buyerId = -1;
          created = true;
        } else {
          const [ins] = await conn.query<ResultSetHeader>(
            `INSERT INTO buyer (entity_key, canonical_name, country_code, name_zh, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'active', NOW(), NOW())`,
            [entityKey, canonical, country, row.zh],
          );
          buyerId = Number(ins.insertId);
          created = true;
        }
        planned.set(plannedKey, buyerId);
      }

      if (!APPLY) {
        result[created ? "created" : "reused"] += 1;
        report.push({ line: row.line, country, name: row.name, zh: row.zh, buyerId: created ? "NEW" : buyerId });
        continue;
      }

      if (!created && buyerId != null) {
        result.reused += 1;
        await conn.query(
          "UPDATE buyer SET name_zh = COALESCE(NULLIF(name_zh, ''), ?), updated_at = NOW() WHERE buyer_id = ?",
          [row.zh, buyerId],
        );
      } else {
        result.created += 1;
      }

      if (buyerId == null) continue;
      const aliasOk = await ensureAlias(conn, buyerId, row.name, country);
      if (aliasOk && canonical !== row.name) await ensureAlias(conn, buyerId, canonical, country);
      if (!aliasOk) {
        result.conflicts += 1;
        skipped.push({ line: row.line, name: row.name, reason: "别名已指向其他实体" });
        continue;
      }

      const [upd] = await conn.query<ResultSetHeader>(
        `UPDATE buyer_candidate
            SET status = 'merged', suggested_buyer_id = ?
          WHERE country_code <=> ? AND (raw_name = ? OR normalized_name = LOWER(?))`,
        [buyerId, country || null, candidateRaw, row.name],
      );
      result.merged += Number(upd.affectedRows ?? 0);

      const [noticeRows] = await conn.query<RowDataPacket[]>(
        "SELECT notice_pk FROM notice_public WHERE buyer_id IS NULL AND buyer_name = ?",
        [row.name],
      );
      for (const n of noticeRows) noticeIds.add(Number(n.notice_pk));
      report.push({ line: row.line, country, name: row.name, zh: row.zh, buyerId, alias: row.name });
    }
  } finally {
    conn.release();
  }

  if (APPLY && noticeNames.size > 0) {
    const names = [...noticeNames];
    for (let i = 0; i < names.length; i += 200) {
      const chunk = names.slice(i, i + 200);
      const [noticeRows] = await pool.query<RowDataPacket[]>(
        `SELECT notice_pk FROM notice_public WHERE buyer_id IS NULL AND buyer_name IN (${chunk.map(() => "?").join(",")})`,
        chunk,
      );
      for (const n of noticeRows) noticeIds.add(Number(n.notice_pk));
    }
  }
  result.notices = noticeIds.size;
  if (!APPLY) {
    console.log(`[batch] DRY 结果：新建 ${result.created} · 复用 ${result.reused} · 冲突 ${result.conflicts} · 将刷新公告 ${result.notices}`);
  } else {
    console.log(`[batch] 落库：新建 ${result.created} · 复用 ${result.reused} · 合并候选 ${result.merged} · 冲突 ${result.conflicts}`);
    if (noticeIds.size > 0) {
      const fresh = await refreshBuyerProjection(pool, { noticeIds: [...noticeIds] });
      console.log(`[batch] 公告投影：${fresh.noticeIds.length} 条 · 服务表 ${fresh.rewritten} · 宽表 ${fresh.wideSynced}`);
      const meili = await syncNoticeIds(pool, fresh.noticeIds);
      console.log(`[batch] 搜索索引：写入 ${meili.synced} · 删除 ${meili.deleted}`);
    }
  }

  if (skipped.length > 0) {
    console.log(`[batch] 跳过 ${skipped.length} 行（前 20）：`);
    for (const s of skipped.slice(0, 20)) console.log(`  L${s.line} ${s.reason}: ${s.name.slice(0, 80)}`);
  }
  const reportPath = `temp/buyer-zh-batch-report-${Date.now()}.json`;
  writeFileSync(reportPath, JSON.stringify({ file: FILE, apply: APPLY, result, skipped, report }, null, 2), "utf8");
  console.log(`[batch] 报告：${reportPath}`);
} finally {
  await pool.end();
}
