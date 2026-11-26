/**
 * 买家实体合并（跨国国际组织 + 同国名称变体）
 *
 * @module scripts/tools/buyer-entity-merge-intl
 * @description 2026-11-26。现有 `buyer-normalize-repair.ts` 只合并「同国 + 同归一名」的重复实体；
 *              跨国同一机构（UNDP 147 条、ILO 117 条、UNICEF 110 条…）仍然是散的，导致
 *              「按机构」维度不成立。本脚本补两类合并：
 *                ① 国际组织：名称命中白名单模式 → 忽略国家，按归一名合并（UNDP 各国办公室收成一条）；
 *                ② 同国名称变体：归一前先展开常见缩写（US→UNITED STATES、DEPT→DEPARTMENT 等），
 *                   同国同键合并（USDA 两类写法收成一条）。
 *
 *              安全边界：
 *              - 默认 DRY，只打印计划；`--apply` 才落库，且先备份 buyer / buyer_alias；
 *              - 只置 `status='inactive'`，不删行；from→to 写入 `buyer_merge_map_<date>`，可回滚；
 *              - 服务表改挂走唯一写入者 `reassignPublicBuyer`（N1 红线），不直接写 notice_public；
 *              - 不碰 notice_search（宽表由构建器负责，下次全量重建时按 alias 归一到留存实体）。
 *
 * 用法：
 *   npx tsx scripts/tools/buyer-entity-merge-intl.ts                  # DRY
 *   npx tsx scripts/tools/buyer-entity-merge-intl.ts --apply          # 落库
 *   npx tsx scripts/tools/buyer-entity-merge-intl.ts --apply --only=intl
 */
import { readFileSync } from "node:fs";
import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import { normalizeBuyerKey } from "../../src/lib/services/buyer/normalize";
import { reassignPublicBuyer } from "../../src/lib/services/notice-public/build";

const APPLY = process.argv.includes("--apply");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length) ?? "all";
const DATE = new Date().toISOString().slice(0, 10).replace(/-/g, "");

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const pool: Pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: "utf8mb4",
  connectionLimit: 4,
});

/**
 * 国际组织识别：只认「名字本身就是全球机构」的写法。
 * 不做「同名即合并」——174 个「国防部」是不同国家的不同机构。
 */
const INTL_PATTERNS: RegExp[] = [
  /^UN\b/, /\bUNITED NATIONS\b/, /\bUNDP\b/, /\bUNICEF\b/, /\bUNOPS\b/, /\bUNHCR\b/,
  /\bUNESCO\b/, /\bUNIDO\b/, /\bUNFPA\b/, /\bUN WOMEN\b/, /\bUNAIDS\b/, /\bUNEP\b/,
  /\bUN-HABITAT\b/, /\bUNCTAD\b/, /\bUNODC\b/, /\bUNRWA\b/, /\bUNITAR\b/,
  /\bWHO\b/, /\bILO\b/, /\bFAO\b/, /\bIOM\b/, /\bIAEA\b/, /\bIFAD\b/, /\bWFP\b/,
  /\bWORLD BANK\b/, /\bIFC\b/, /\bIMF\b/, /\bADB\b/, /\bAFDB\b/, /\bEBRD\b/,
  /\bASIAN DEVELOPMENT BANK\b/, /\bAFRICAN DEVELOPMENT BANK\b/, /\bINTER-AMERICAN DEVELOPMENT BANK\b/,
  /\bEUROPEAN COMMISSION\b/, /\bEUROPEAN UNION\b/, /\bEUROPEAID\b/,
  /\bGIZ\b/, /\bDEUTSCHE GESELLSCHAFT FÜR INTERNATIONALE ZUSAMMENARBEIT\b/,
  /\bNATO\b/, /\bOECD\b/, /\bOSCE\b/, /\bICRC\b/, /\bRED CROSS\b/, /\bRED CRESCENT\b/,
];

const isIntlOrg = (name: string): boolean => {
  const upper = String(name || "").toUpperCase();
  return INTL_PATTERNS.some((re) => re.test(upper));
};

/** 合并键专用缩写展开（只用于「是不是同一个机构」判定，不改写库里的规范名） */
const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bU\.S\.A?\.?\b/g, "UNITED STATES"],
  [/\bUS\b/g, "UNITED STATES"],
  [/\bDEPT\.?\b/g, "DEPARTMENT"],
  [/\bGOVT\.?\b/g, "GOVERNMENT"],
  [/\bNATL\.?\b/g, "NATIONAL"],
  [/\bORG\.?\b/g, "ORGANIZATION"],
  [/\bINTL\.?\b/g, "INTERNATIONAL"],
];

const expand = (name: string): string => {
  let out = String(name || "");
  for (const [re, to] of ABBREVIATIONS) out = out.replace(re, to);
  return out;
};

interface Entity {
  id: number;
  canonical: string;
  nameZh: string | null;
  country: string;
}

async function backup(): Promise<void> {
  for (const t of ["buyer", "buyer_alias"]) {
    await pool.query(`CREATE TABLE IF NOT EXISTS \`${t}_bak_${DATE}\` AS SELECT * FROM \`${t}\``);
    console.log(`[backup] ${t}_bak_${DATE}`);
  }
  await pool.query(
    `CREATE TABLE IF NOT EXISTS buyer_merge_map_${DATE} (
       from_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
       to_id BIGINT UNSIGNED NOT NULL,
       rule VARCHAR(20) NOT NULL,
       notices INT NOT NULL,
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
  );
  console.log(`[backup] buyer_merge_map_${DATE}`);
}

async function noticesByBuyer(ids: number[]): Promise<Map<number, number>> {
  if (ids.length === 0) return new Map();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT buyer_id, COUNT(*) AS c FROM notice_public
      WHERE buyer_id IN (${ids.map(() => "?").join(",")}) GROUP BY buyer_id`,
    ids,
  );
  return new Map(rows.map((r) => [Number(r.buyer_id), Number(r.c)]));
}

async function main(): Promise<void> {
  if (APPLY) await backup();

  const [buyers] = await pool.query<RowDataPacket[]>(
    "SELECT buyer_id, canonical_name, name_zh, country_code FROM buyer WHERE status = 'active'",
  );
  const entities: Entity[] = buyers.map((b) => ({
    id: Number(b.buyer_id),
    canonical: String(b.canonical_name),
    nameZh: b.name_zh == null ? null : String(b.name_zh),
    country: String(b.country_code ?? "").trim().toUpperCase(),
  }));

  // ── 分组：同国变体键 与 国际组织键（后者忽略国家）──
  const variantGroups = new Map<string, Entity[]>();
  const intlGroups = new Map<string, Entity[]>();
  for (const e of entities) {
    const key = normalizeBuyerKey(expand(e.canonical));
    if (!key) continue;
    const vk = `${e.country}|${key}`;
    (variantGroups.get(vk) ?? variantGroups.set(vk, []).get(vk)!).push(e);
    if (isIntlOrg(e.canonical)) {
      (intlGroups.get(key) ?? intlGroups.set(key, []).get(key)!).push(e);
    }
  }

  const plans: Array<{ rule: "intl" | "variant"; groupKey: string; keeper: Entity; dups: Entity[] }> = [];
  const seen = new Set<number>();

  if (ONLY === "all" || ONLY === "intl") {
    for (const [key, arr] of intlGroups) {
      if (arr.length < 2) continue;
      const counts = await noticesByBuyer(arr.map((e) => e.id));
      const keeper = [...arr].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.id - b.id)[0];
      const dups = arr.filter((e) => e.id !== keeper.id);
      plans.push({ rule: "intl", groupKey: key, keeper, dups });
      for (const d of dups) seen.add(d.id);
    }
  }

  if (ONLY === "all" || ONLY === "variant") {
    for (const [key, arr] of variantGroups) {
      const fresh = arr.filter((e) => !seen.has(e.id));
      if (fresh.length < 2) continue;
      const counts = await noticesByBuyer(fresh.map((e) => e.id));
      const keeper = [...fresh].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.id - b.id)[0];
      const dups = fresh.filter((e) => e.id !== keeper.id);
      plans.push({ rule: "variant", groupKey: key, keeper, dups });
      for (const d of dups) seen.add(d.id);
    }
  }

  const totalDups = plans.reduce((n, p) => n + p.dups.length, 0);
  console.log(`[plan] groups=${plans.length} duplicates=${totalDups} mode=${APPLY ? "APPLY" : "DRY"} only=${ONLY}`);
  console.log("[plan] top groups:");
  for (const p of plans.slice(0, 15)) {
    console.log(`  - [${p.rule}] ${p.keeper.canonical} → keep ${p.keeper.id}, merge ${p.dups.map((d) => d.id).join(",")}`);
  }

  if (!APPLY) {
    console.log("[dry] 未写库；确认后加 --apply");
    return;
  }

  let merged = 0;
  let affected = 0;
  for (const p of plans) {
    const counts = await noticesByBuyer(p.dups.map((d) => d.id));
    for (const dup of p.dups) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const n = await reassignPublicBuyer(conn, {
          fromBuyerId: dup.id,
          toBuyerId: p.keeper.id,
          canonicalName: p.keeper.canonical,
          nameZh: p.keeper.nameZh,
        });
        await conn.query("UPDATE buyer_alias SET buyer_id = ? WHERE buyer_id = ?", [p.keeper.id, dup.id]);
        await conn.query("UPDATE buyer SET status = 'inactive' WHERE buyer_id = ?", [dup.id]);
        await conn.query(
          `INSERT INTO buyer_merge_map_${DATE} (from_id, to_id, rule, notices) VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE to_id = VALUES(to_id), rule = VALUES(rule), notices = VALUES(notices)`,
          [dup.id, p.keeper.id, p.rule, counts.get(dup.id) ?? 0],
        );
        await conn.commit();
        merged += 1;
        affected += n;
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    }
  }
  console.log(`[apply] merged=${merged} notices_reassigned=${affected} map=buyer_merge_map_${DATE}`);
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("[fatal]", err);
    await pool.end();
    process.exit(1);
  });
