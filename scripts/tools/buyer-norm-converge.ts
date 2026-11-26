/**
 * 买家实体归一 · 规整与校验（2026-11-26）
 *
 * 目标：把 buyer / buyer_alias / buyer_candidate 三表里「同一件事三套键」的存量脏数据收敛掉，
 * 并加上归一列与唯一约束，防止同国同名实体、同一归一键指向多实体再次出现。
 *
 * 用法（在 /root/supply-os 下执行，脚本自己读 .env）：
 *   npx tsx scripts/tools/buyer-normalize-repair.ts                     # 只读体检（默认）
 *   npx tsx scripts/tools/buyer-normalize-repair.ts --apply-alias       # 删冗余别名 + 解冲突
 *   npx tsx scripts/tools/buyer-normalize-repair.ts --apply-candidate   # 候选同义合并
 *   npx tsx scripts/tools/buyer-normalize-repair.ts --apply-merge [--limit=N]  # 合并重复实体
 *   npx tsx scripts/tools/buyer-normalize-repair.ts --apply-schema      # 加归一列/唯一键
 *
 * 安全约定：
 *   · 归一化只调用 src 里的 normalizeBuyerKey，不在 SQL 里复刻（杜绝第四套口径）；
 *   · 合并实体走 refreshBuyerProjection（服务表→宽表→Meili），不直写 notice_public；
 *   · 每批 500 行、每组一个事务；失败即停，可重复执行（幂等）。
 */
import { readFileSync } from "node:fs";
import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import { normalizeBuyerKey } from "../../src/lib/services/buyer/normalize";

const args = new Set(process.argv.slice(2));
const APPLY_ALIAS = args.has("--apply-alias");
const APPLY_CANDIDATE = args.has("--apply-candidate");
const APPLY_MERGE = args.has("--apply-merge");
const APPLY_SCHEMA = args.has("--apply-schema");
const LIMIT = Number(([...args].find((a) => a.startsWith("--limit=")) ?? "").split("=")[1]) || 0;
const BATCH = 500;

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const pool: Pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm",
  charset: "utf8mb4",
  connectionLimit: 2,
});

interface BuyerRow extends RowDataPacket {
  buyer_id: number; canonical_name: string | null; country_code: string | null;
  name_zh: string | null; status: string;
}
interface AliasRow extends RowDataPacket {
  alias_key: string; buyer_id: number; alias: string | null; country_code: string | null;
}
interface CandidateRow extends RowDataPacket {
  candidate_key: string; country_code: string | null; raw_name: string | null;
  normalized_name: string | null; occurrence_count: number; status: string;
}

const cc = (v: unknown) => String(v ?? "").trim().toUpperCase();
/** 同国判定：两边都空也算同国（空国别是真实存在的一类） */
const sameCountry = (a: unknown, b: unknown) => cc(a) === cc(b);
const groupKey = (country: unknown, norm: string) => `${cc(country)}|${norm}`;

async function loadAll() {
  const [buyers] = await pool.query<BuyerRow[]>(
    "SELECT buyer_id, canonical_name, country_code, name_zh, status FROM buyer",
  );
  const [aliases] = await pool.query<AliasRow[]>(
    "SELECT alias_key, buyer_id, alias, country_code FROM buyer_alias",
  );
  const [candidates] = await pool.query<CandidateRow[]>(
    "SELECT candidate_key, country_code, raw_name, normalized_name, occurrence_count, status FROM buyer_candidate",
  );
  const buyerById = new Map(buyers.map((b) => [Number(b.buyer_id), b]));
  return { buyers, aliases, candidates, buyerById };
}

function planAliases(buyers: BuyerRow[], aliases: AliasRow[], buyerById: Map<number, BuyerRow>) {
  const canonNorm = new Map<number, string>();
  for (const b of buyers) canonNorm.set(Number(b.buyer_id), normalizeBuyerKey(b.canonical_name));

  /** 归一后等于规范名、且同国的别名：纯冗余（匹配器本来就登记 canonical_name） */
  const redundant: string[] = [];
  /** 需要删除的冲突别名（同国同归一键指向多个实体，且无法由 canonical 收敛） */
  const conflicting: string[] = [];
  /** 同一实体下、不同写法但归一到同一键的重复行（唯一键不允许），每组留最短写法 */
  const sameBuyerDup: string[] = [];

  const byKey = new Map<string, AliasRow[]>();
  for (const a of aliases) {
    const norm = normalizeBuyerKey(a.alias);
    if (!norm) continue;
    const k = groupKey(a.country_code, norm);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(a);
    const buyer = buyerById.get(Number(a.buyer_id));
    if (buyer && sameCountry(a.country_code, buyer.country_code) && norm === canonNorm.get(Number(a.buyer_id))) {
      redundant.push(String(a.alias_key));
    }
  }

  const redundantSet = new Set(redundant);
  // 索引装载时会把每个实体的 canonical_name 也登记成命中键；若某别名与「另一家实体」的
  // 规范名同国同键，别名行就与规范名冲突（匹配器按规范名优先收敛）→ 以规范名为准删别名。
  const canonicalOwners = new Map<string, Set<number>>();
  for (const b of buyers) {
    if (b.status !== "active") continue;
    const norm = canonNorm.get(Number(b.buyer_id)) ?? "";
    if (!norm) continue;
    const k = groupKey(b.country_code, norm);
    if (!canonicalOwners.has(k)) canonicalOwners.set(k, new Set());
    canonicalOwners.get(k)!.add(Number(b.buyer_id));
  }
  for (const a of aliases) {
    if (redundantSet.has(String(a.alias_key))) continue;
    const buyer = buyerById.get(Number(a.buyer_id));
    if (!buyer || buyer.status !== "active") continue;
    const norm = normalizeBuyerKey(a.alias);
    if (!norm) continue;
    const owners = canonicalOwners.get(groupKey(a.country_code, norm));
    if (!owners) continue;
    if ([...owners].some((id) => id !== Number(a.buyer_id))) conflicting.push(String(a.alias_key));
  }

  for (const [, rows] of byKey) {
    const alive = rows.filter((r) => !redundantSet.has(String(r.alias_key)));
    const ids = new Set(alive.map((r) => Number(r.buyer_id)));
    if (ids.size === 1 && alive.length > 1) {
      const keep = [...alive].sort((a, b) =>
        String(a.alias ?? "").length - String(b.alias ?? "").length ||
        String(a.alias_key).localeCompare(String(b.alias_key)))[0];
      for (const r of alive) if (String(r.alias_key) !== String(keep.alias_key)) sameBuyerDup.push(String(r.alias_key));
      continue;
    }
    if (ids.size <= 1) continue;
    // 同国同归一键仍指向多实体：优先保留「别名正好等于该实体规范名」的那一条
    const canonicalOwner = alive.find((r) => {
      const buyer = buyerById.get(Number(r.buyer_id));
      return buyer && canonNorm.get(Number(r.buyer_id)) === normalizeBuyerKey(r.alias);
    });
    if (canonicalOwner) {
      for (const r of alive) {
        if (Number(r.buyer_id) !== Number(canonicalOwner.buyer_id)) conflicting.push(String(r.alias_key));
      }
    } else {
      // 谁都不像真名：整组删掉，交给 canonical 命中 / 候选队列（不猜）
      for (const r of alive) conflicting.push(String(r.alias_key));
    }
  }
  return { redundant, conflicting, sameBuyerDup, canonNorm };
}

function planCandidates(candidates: CandidateRow[]) {
  const groups = new Map<string, CandidateRow[]>();
  for (const c of candidates) {
    const norm = normalizeBuyerKey(c.raw_name);
    if (!norm) continue;
    const k = groupKey(c.country_code, norm);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(c);
  }
  const drop: string[] = [];
  let groupsFixed = 0;
  for (const [, rows] of groups) {
    if (rows.length <= 1) continue;
    groupsFixed += 1;
    const keep = [...rows].sort((a, b) => Number(b.occurrence_count) - Number(a.occurrence_count))[0];
    for (const r of rows) if (String(r.candidate_key) !== String(keep.candidate_key)) drop.push(String(r.candidate_key));
  }
  return { drop, groupsFixed };
}

async function noticeCounts(ids: number[]) {
  const map = new Map<number, number>();
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT buyer_id, COUNT(*) n FROM notice_public WHERE buyer_id IN (${chunk.map(() => "?").join(",")}) GROUP BY buyer_id`,
      chunk,
    );
    for (const r of rows) map.set(Number(r.buyer_id), Number(r.n));
  }
  return map;
}

async function planMerge(buyers: BuyerRow[], buyerById: Map<number, BuyerRow>) {
  const groups = new Map<string, BuyerRow[]>();
  for (const b of buyers) {
    if (b.status !== "active") continue;
    const norm = normalizeBuyerKey(b.canonical_name);
    if (!norm) continue;
    const k = groupKey(b.country_code, norm);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(b);
  }
  const dupGroups = [...groups.entries()].filter(([, rows]) => rows.length > 1);
  const allIds = dupGroups.flatMap(([, rows]) => rows.map((r) => Number(r.buyer_id)));
  const counts = await noticeCounts(allIds);
  const plan = dupGroups.map(([k, rows]) => {
    const members = [...rows].sort((a, b) =>
      (counts.get(Number(b.buyer_id)) ?? 0) - (counts.get(Number(a.buyer_id)) ?? 0) || Number(a.buyer_id) - Number(b.buyer_id));
    return { key: k, keeper: members[0], dups: members.slice(1) };
  });
  // 按牵动公告数降序，便于先处理影响大的
  plan.sort((a, b) => (counts.get(Number(a.keeper.buyer_id)) ?? 0) - (counts.get(Number(b.keeper.buyer_id)) ?? 0));
  return { plan, counts };
}

async function report() {
  const { buyers, aliases, candidates, buyerById } = await loadAll();
  const { redundant, conflicting } = planAliases(buyers, aliases, buyerById);
  const cand = planCandidates(candidates);
  const { plan, counts } = await planMerge(buyers, buyerById);
  const affectedNotices = plan.reduce((sum, g) => sum + g.dups.reduce((s, d) => s + (counts.get(Number(d.buyer_id)) ?? 0), 0), 0);
  console.log(JSON.stringify({
    buyers: buyers.length, activeBuyers: buyers.filter((b) => b.status === "active").length,
    aliases: aliases.length, candidates: candidates.length,
    redundantAliases: redundant.length,
    conflictingAliases: conflicting.length,
    candidateDupRows: cand.drop.length, candidateDupGroups: cand.groupsFixed,
    duplicateBuyerGroups: plan.length, duplicateBuyerRows: plan.reduce((s, g) => s + g.dups.length, 0),
    affectedNotices,
    sampleGroups: plan.slice(0, 3).map((g) => ({
      key: g.key, keeper: { id: Number(g.keeper.buyer_id), name: g.keeper.canonical_name, notices: counts.get(Number(g.keeper.buyer_id)) ?? 0 },
      dups: g.dups.map((d) => ({ id: Number(d.buyer_id), name: d.canonical_name, notices: counts.get(Number(d.buyer_id)) ?? 0 })),
    })),
  }, null, 2));
}

async function deleteKeys(table: string, column: string, keys: string[]) {
  let done = 0;
  for (let i = 0; i < keys.length; i += BATCH) {
    const chunk = keys.slice(i, i + BATCH);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(`DELETE FROM ${table} WHERE ${column} IN (${chunk.map(() => "?").join(",")})`, chunk);
      await conn.commit();
      done += chunk.length;
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  }
  return done;
}

async function applyAlias() {
  const { buyers, aliases, buyerById } = await loadAll();
  const { redundant, conflicting, sameBuyerDup } = planAliases(buyers, aliases, buyerById);
  const all = [...new Set([...redundant, ...conflicting, ...sameBuyerDup])];
  console.log(`[alias] 冗余 ${redundant.length} · 冲突 ${conflicting.length} · 同实体重复 ${sameBuyerDup.length} · 合并去重后待删 ${all.length}`);
  const n = await deleteKeys("buyer_alias", "alias_key", all);
  console.log(`[alias] 已删 ${n} 行`);
}

async function applyCandidate() {
  const { candidates } = await loadAll();
  const { drop, groupsFixed } = planCandidates(candidates);
  console.log(`[candidate] 同义组 ${groupsFixed} · 待删行 ${drop.length}`);
  const n = await deleteKeys("buyer_candidate", "candidate_key", drop);
  console.log(`[candidate] 已删 ${n} 行`);
}

async function applyMerge() {
  const { buyers, buyerById, aliases } = await loadAll();
  const { plan } = await planMerge(buyers, buyerById);
  const targets = LIMIT > 0 ? plan.slice(0, LIMIT) : plan;
  const aliasKeysOf = new Map<number, Set<string>>();
  for (const a of aliases) {
    const id = Number(a.buyer_id);
    if (!aliasKeysOf.has(id)) aliasKeysOf.set(id, new Set());
    aliasKeysOf.get(id)!.add(String(a.alias_key));
  }

  const noticeIds: number[] = [];
  let merged = 0;
  for (const g of targets) {
    for (const dup of g.dups) {
      const dupId = Number(dup.buyer_id), keepId = Number(g.keeper.buyer_id);
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        // ① 别名归并：keeper 已有同键则删除重复，否则改挂
        for (const key of aliasKeysOf.get(dupId) ?? []) {
          if (aliasKeysOf.get(keepId)?.has(key)) {
            await conn.execute("DELETE FROM buyer_alias WHERE alias_key = ?", [key]);
          } else {
            await conn.execute("UPDATE buyer_alias SET buyer_id = ? WHERE alias_key = ?", [keepId, key]);
            aliasKeysOf.get(keepId)?.add(key);
          }
          aliasKeysOf.get(dupId)?.delete(key);
        }
        // ② keeper 缺中文名时继承一个
        await conn.execute(
          "UPDATE buyer SET name_zh = COALESCE(name_zh, ?) WHERE buyer_id = ?",
          [dup.name_zh ?? null, keepId],
        );
        // ③ 旧实体下线（保留行以维持历史 buyer_id 可追溯）
        await conn.execute("UPDATE buyer SET status = 'inactive' WHERE buyer_id = ?", [dupId]);
        // ④ 收集受影响公告
        const [rows] = await conn.query<RowDataPacket[]>(
          "SELECT notice_pk FROM notice_public WHERE buyer_id = ?", [dupId],
        );
        for (const r of rows) noticeIds.push(Number(r.notice_pk));
        await conn.commit();
        merged += 1;
      } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    }
  }
  const ids = [...new Set(noticeIds)];
  console.log(`[merge] 合并 ${merged} 个重复实体 · 牵动公告 ${ids.length} 条 → 重建投影`);
  if (ids.length) {
    // 动态引入：report/alias 阶段不需要拉起 Meili / 宽表依赖
    const { refreshBuyerProjection } = await import("../../src/lib/services/buyer/refresh");
    const res = await refreshBuyerProjection(pool, { noticeIds: ids });
    console.log(`[merge] 投影回填：服务表 ${res.rewritten} · 宽表 ${res.wideSynced}`);
  }
  const [left] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) n FROM notice_public p JOIN buyer b ON b.buyer_id = p.buyer_id WHERE b.status = 'inactive'`,
  );
  console.log(`[merge] 仍挂在 inactive 实体上的公告：${Number(left[0]?.n ?? 0)}（应为 0）`);
}

async function hasColumn(table: string, column: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
    [table, column],
  );
  return rows.length > 0;
}
async function hasIndex(table: string, index: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1",
    [table, index],
  );
  return rows.length > 0;
}

async function applySchema() {
  if (!(await hasColumn("buyer", "canonical_norm"))) {
    await pool.query("ALTER TABLE buyer ADD COLUMN canonical_norm VARCHAR(500) NULL, ADD COLUMN norm_version SMALLINT NOT NULL DEFAULT 2");
    console.log("[schema] buyer 已加 canonical_norm / norm_version");
  }
  if (!(await hasColumn("buyer_alias", "norm_key"))) {
    await pool.query("ALTER TABLE buyer_alias ADD COLUMN norm_key VARCHAR(500) NULL, ADD COLUMN norm_version SMALLINT NOT NULL DEFAULT 2");
    console.log("[schema] buyer_alias 已加 norm_key / norm_version");
  }
  if (!(await hasColumn("buyer_candidate", "norm_key"))) {
    await pool.query("ALTER TABLE buyer_candidate ADD COLUMN norm_key VARCHAR(500) NULL");
    console.log("[schema] buyer_candidate 已加 norm_key");
  }

  // 归一列必须大小写/重音敏感：库默认 utf8mb4_0900_ai_ci 会把 MINISTÉRIO 和 MINISTERIO
  // 当成同一个值，唯一键会误拒「重音不同的两家机构」，与 normalizeBuyerKey 的语义相反。
  for (const [table, column] of [["buyer", "canonical_norm"], ["buyer_alias", "norm_key"], ["buyer_candidate", "norm_key"]] as const) {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT COLLATION_NAME coll FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
      [table, column],
    );
    const coll = String(rows[0]?.coll ?? "");
    if (coll && coll !== "utf8mb4_bin") {
      await pool.query(`ALTER TABLE ${table} MODIFY ${column} VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL`);
      console.log(`[schema] ${table}.${column} 改为 utf8mb4_bin（原 ${coll}）`);
    }
  }

  // 回填（应用侧归一，分批）
  const { buyers, aliases, candidates } = await loadAll();
  for (let i = 0; i < buyers.length; i += BATCH) {
    const chunk = buyers.slice(i, i + BATCH);
    const cases = chunk.map(() => "WHEN ? THEN ?").join(" ");
    const params: unknown[] = [];
    for (const b of chunk) params.push(Number(b.buyer_id), normalizeBuyerKey(b.canonical_name));
    await pool.query(
      `UPDATE buyer SET canonical_norm = CASE buyer_id ${cases} END WHERE buyer_id IN (${chunk.map(() => "?").join(",")})`,
      [...params, ...chunk.map((b) => Number(b.buyer_id))],
    );
  }
  console.log(`[schema] buyer.canonical_norm 回填 ${buyers.length} 行`);

  for (let i = 0; i < aliases.length; i += BATCH) {
    const chunk = aliases.slice(i, i + BATCH);
    const cases = chunk.map(() => "WHEN ? THEN ?").join(" ");
    const params: unknown[] = [];
    for (const a of chunk) params.push(String(a.alias_key), normalizeBuyerKey(a.alias));
    await pool.query(
      `UPDATE buyer_alias SET norm_key = CASE alias_key ${cases} END WHERE alias_key IN (${chunk.map(() => "?").join(",")})`,
      [...params, ...chunk.map((a) => String(a.alias_key))],
    );
  }
  console.log(`[schema] buyer_alias.norm_key 回填 ${aliases.length} 行`);

  for (let i = 0; i < candidates.length; i += BATCH) {
    const chunk = candidates.slice(i, i + BATCH);
    const cases = chunk.map(() => "WHEN ? THEN ?").join(" ");
    const params: unknown[] = [];
    for (const c of chunk) params.push(String(c.candidate_key), normalizeBuyerKey(c.raw_name));
    await pool.query(
      `UPDATE buyer_candidate SET norm_key = CASE candidate_key ${cases} END WHERE candidate_key IN (${chunk.map(() => "?").join(",")})`,
      [...params, ...chunk.map((c) => String(c.candidate_key))],
    );
  }
  console.log(`[schema] buyer_candidate.norm_key 回填 ${candidates.length} 行`);

  // 唯一键覆盖**全部行**（不只 active）：同组只保留一个规范键，其余置 NULL。
  // inactive 行不参与匹配，置 NULL 不会影响检索；这样建唯一键不会被历史下线行卡住。
  {
    const [all] = await pool.query<RowDataPacket[]>(
      "SELECT buyer_id, country_code, canonical_norm, status FROM buyer WHERE canonical_norm IS NOT NULL",
    );
    const groups = new Map<string, Array<{ id: number; active: boolean }>>();
    for (const r of all) {
      const k = `${String(r.country_code ?? "").trim().toUpperCase()}|${String(r.canonical_norm)}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push({ id: Number(r.buyer_id), active: r.status === "active" });
    }
    const nullIds: number[] = [];
    for (const [, rows] of groups) {
      if (rows.length <= 1) continue;
      const keeper = [...rows].sort((a, b) => Number(b.active) - Number(a.active) || a.id - b.id)[0];
      for (const r of rows) if (r.id !== keeper.id) nullIds.push(r.id);
    }
    for (let i = 0; i < nullIds.length; i += BATCH) {
      const chunk = nullIds.slice(i, i + BATCH);
      await pool.query(
        `UPDATE buyer SET canonical_norm = NULL WHERE buyer_id IN (${chunk.map(() => "?").join(",")})`,
        chunk,
      );
    }
    console.log(`[schema] 重复实体行去号（置 NULL）：${nullIds.length} 行`);
  }

  // 唯一键：先确认没有残留冲突，否则 ALTER 会直接失败
  const [dupBuyer] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) n FROM (SELECT country_code, canonical_norm FROM buyer
       WHERE status = 'active' AND canonical_norm IS NOT NULL
       GROUP BY 1,2 HAVING COUNT(*) > 1) x`,
  );
  const [dupAlias] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) n FROM (SELECT country_code, norm_key FROM buyer_alias
       WHERE norm_key IS NOT NULL GROUP BY 1,2 HAVING COUNT(*) > 1) x`,
  );
  console.log(`[schema] 残留冲突：实体 ${Number(dupBuyer[0]?.n ?? 0)} 组 · 别名 ${Number(dupAlias[0]?.n ?? 0)} 组`);
  if (Number(dupBuyer[0]?.n ?? 0) > 0 || Number(dupAlias[0]?.n ?? 0) > 0) {
    console.log("[schema] 有残留冲突，跳过建唯一键（先跑 --apply-merge / --apply-alias）");
    return;
  }
  if (!(await hasIndex("buyer", "uk_buyer_norm"))) {
    await pool.query("ALTER TABLE buyer ADD UNIQUE KEY uk_buyer_norm (country_code, canonical_norm)");
    console.log("[schema] 已建 buyer.uk_buyer_norm");
  }
  if (!(await hasIndex("buyer_alias", "uk_alias_norm"))) {
    await pool.query("ALTER TABLE buyer_alias ADD UNIQUE KEY uk_alias_norm (country_code, norm_key)");
    console.log("[schema] 已建 buyer_alias.uk_alias_norm");
  }
  if (!(await hasIndex("buyer_candidate", "idx_candidate_norm"))) {
    await pool.query("ALTER TABLE buyer_candidate ADD KEY idx_candidate_norm (country_code, norm_key)");
    console.log("[schema] 已建 buyer_candidate.idx_candidate_norm（候选由应用写入，故不设唯一键）");
  }
}

/**
 * 增量守护（建议 cron 每日跑）：只补 norm_key 为 NULL 的行，并报告违反唯一性的重复组。
 * 遇到会撞唯一键的行不更新，只计数并打印样本——让漂移可见，而不是让脚本炸掉或静默放过。
 */
async function syncNorm() {
  // 唯一键是 (country_code, norm_key)：撞键判断必须带国家，否则跨国同名候选会被误跳过
  const fill = async (
    table: string, idCol: string, nameCol: string, normCol: string, activeFilter: string,
  ) => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${idCol} id, ${nameCol} name, country_code cc FROM ${table} WHERE ${normCol} IS NULL ${activeFilter}`,
    );
    const [existing] = await pool.query<RowDataPacket[]>(
      `SELECT ${normCol} k, country_code cc FROM ${table} WHERE ${normCol} IS NOT NULL`,
    );
    const taken = new Set(existing.map((r) => `${cc(r.cc)}|${String(r.k)}`));
    const todo: Array<[string, string]> = [];
    let skipped = 0;
    for (const r of rows) {
      const key = normalizeBuyerKey(r.name);
      if (!key) continue;
      const gk = `${cc(r.cc)}|${key}`;
      if (taken.has(gk)) { skipped += 1; continue; }
      taken.add(gk);
      todo.push([key, String(r.id)]);
    }
    for (let i = 0; i < todo.length; i += BATCH) {
      const chunk = todo.slice(i, i + BATCH);
      const cases = chunk.map(() => "WHEN ? THEN ?").join(" ");
      const params: unknown[] = [];
      for (const [key, id] of chunk) params.push(id, key);
      await pool.query(
        `UPDATE ${table} SET ${normCol} = CASE ${idCol} ${cases} END
          WHERE ${normCol} IS NULL AND ${idCol} IN (${chunk.map(() => "?").join(",")})`,
        [...params, ...chunk.map(([, id]) => id)],
      );
    }
    console.log(`[sync-norm] ${table}: 补 ${todo.length} 行，因撞唯一键跳过 ${skipped} 行（需人工处理）`);
  };
  await fill("buyer", "buyer_id", "canonical_name", "canonical_norm", "AND status = 'active'");
  await fill("buyer_alias", "alias_key", "alias", "norm_key", "");
  await fill("buyer_candidate", "candidate_key", "raw_name", "norm_key", "");
}

try {
  if (APPLY_ALIAS) await applyAlias();
  else if (APPLY_CANDIDATE) await applyCandidate();
  else if (APPLY_MERGE) await applyMerge();
  else if (APPLY_SCHEMA) await applySchema();
  else if (args.has("--sync-norm")) await syncNorm();
  else await report();
} finally {
  await pool.end();
}
