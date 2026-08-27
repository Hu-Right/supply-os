/**
 * 宽表行构建器 + 数据加载
 * Wide Row Builder & Data Loading
 *
 * @module server/services/search-sync/wide-row-builder
 * @description 负责 crm_notice_search 宽表的数据加载、行构建、deadline 对账和批量写入。
 *              与 sync-scheduler.ts（调度层）分离，实现数据构建与同步时机的解耦。
 */
import "server-only";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { normalizeDocumentRows } from "../../utils/normalize";
import { normalizeNoticeType } from "../../utils/notice-type";
import { classifyAgencyType } from "../agency/index";
import { COUNTRY_NAME_ZH } from "../../../lib/data/countryNames";
import { normalizeCountry } from "../../utils/countryNormalize";

// ── 支持的语言列表 ──
export const SUPPORTED_LANGS = ["zh", "en", "fr", "ru", "es", "ar"];

// ── 对账日志节流（同一类型 30 分钟内不重复输出，避免高频刷屏）──
const RECONCILE_LOG_TTL = 30 * 60 * 1000;
const _reconcileLogLast: Map<string, { ts: number; count: number }> = new Map();
function reconcileLog(type: string, count: number, msg: string): void {
  const now = Date.now();
  const prev = _reconcileLogLast.get(type);
  if (prev && now - prev.ts < RECONCILE_LOG_TTL) return;
  _reconcileLogLast.set(type, { ts: now, count });
  console.log(msg);
}

// ── 同步 SQL（含所有语言翻译，不含 UNSPSC）──
// 注意：不再查询 is_active，因为搜索过滤只用 deadline_sec 实时判断
export const WIDE_SYNC_SELECT = `
  SELECT n.id, n.notice_id, n.reference, n.title,
         n.description,
         n.country, n.agency, n.notice_type, n.deadline_sec,
         n.is_featured,
         n.estimated_value, n.documents, n.procurement_files,
         opp.description_cn, LEFT(opp.bid_overview, 200) AS bid_overview,
         opp.beneficiary_countries
`;
export const WIDE_SYNC_JOIN = `
  FROM crm_bid_notices n
  LEFT JOIN crm_bid_opportunities opp ON opp.source_notice_id = n.notice_id
    AND (opp.is_qualified = 1 OR opp.status = 1 OR opp.audit_status = 1)
`;

// ── 批量查询翻译（按 notice_id 列表查询所有语言）──
export async function loadTranslationsByNoticeIds(pool: Pool, noticeIds: number[]): Promise<Map<number, Record<string, { title: string; description: string }>>> {
  if (noticeIds.length === 0) return new Map();
  const result = new Map<number, Record<string, { title: string; description: string }>>();
  
  const placeholders = noticeIds.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT notice_id, lang, title_tr, description_tr
     FROM crm_notice_translations
     WHERE notice_id IN (${placeholders})`,
    noticeIds,
  );
  
  for (const row of rows as RowDataPacket[]) {
    const nid = Number(row.notice_id);
    if (!result.has(nid)) result.set(nid, {});
    const entry = result.get(nid)!;
    entry[String(row.lang)] = {
      title: String(row.title_tr || ""),
      description: String(row.description_tr || ""),
    };
  }
  return result;
}

// ── 金额字段解析：提取数值部分（处理 "USD 14,000" 等格式）──
function parseDecimalValue(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === "number") return raw;
  const str = String(raw).trim();
  if (!str) return 0;
  const cleaned = str.replace(/[^0-9.\-]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// ── UNSPSC 批量查询（按 notice_id 列表查询，避免 GROUP_CONCAT）──
export async function loadUnspscByNoticeIds(pool: Pool, noticeIds: string[]): Promise<Map<string, Record<string, string>>> {
  if (noticeIds.length === 0) return new Map();
  const result = new Map<string, Record<string, Set<string>>>();
  
  const placeholders = noticeIds.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT notice_id, level1_id, level2_id, level3_id, level4_id, level5_id
     FROM crm_bid_notice_unspsc_codes
     WHERE notice_id IN (${placeholders})`,
    noticeIds,
  );
  
  for (const row of rows as RowDataPacket[]) {
    const nid = String(row.notice_id);
    if (!result.has(nid)) {
      result.set(nid, {
        level1: new Set(), level2: new Set(), level3: new Set(),
        level4: new Set(), level5: new Set(),
      });
    }
    const entry = result.get(nid)!;
    if (row.level1_id) entry.level1.add(String(row.level1_id));
    if (row.level2_id) entry.level2.add(String(row.level2_id));
    if (row.level3_id) entry.level3.add(String(row.level3_id));
    if (row.level4_id) entry.level4.add(String(row.level4_id));
    if (row.level5_id) entry.level5.add(String(row.level5_id));
  }
  
  // 转换为 Map<string, Record<string, string>>
  const final = new Map<string, Record<string, string>>();
  for (const [nid, entry] of result) {
    final.set(nid, {
      level1: Array.from(entry.level1).join(","),
      level2: Array.from(entry.level2).join(","),
      level3: Array.from(entry.level3).join(","),
      level4: Array.from(entry.level4).join(","),
      level5: Array.from(entry.level5).join(","),
    });
  }
  return final;
}

// ── 精准分类（approved 候选码）批量加载 ──
export interface PreciseLevels {
  level1: string;
  level2: string;
  level3: string;
  level4: string;
  level5: string;
}

/** 候选码 → 五级 id 映射（纯函数）：rows 为字典 level=5 链式查询结果（列 code/l1..l5） */
export function buildCodeLevelMap(rows: RowDataPacket[]): Map<string, PreciseLevels> {
  const map = new Map<string, PreciseLevels>();
  for (const row of rows) {
    const code = String(row.code || "").trim();
    if (!code) continue;
    map.set(code, {
      level1: String(row.l1 || ""),
      level2: String(row.l2 || ""),
      level3: String(row.l3 || ""),
      level4: String(row.l4 || ""),
      level5: String(row.l5 || ""),
    });
  }
  return map;
}

// 候选码→五级 id 解析缓存（候选码总量小：543 个；TTL 10 分钟，仿 loadAliasMap）
//
// 架构说明：此缓存与 unspsc/tree-cache.ts 的缓存是**有意分离**的两套实现：
// - tree-cache：面向桥接同步（bridge-sync）和过滤器构建，缓存完整类目树（含路径回溯）；
// - 本缓存：面向宽表构建的"候选码→五级 id"快速查询，仅缓存 level=5 的链式 JOIN 结果。
// 两者查询模式不同（全树 vs. level-5 链式），TTL 策略独立，互不干扰。
// 若未来查询模式趋同，可考虑统一至 tree-cache 模块。
let _preciseCodeMapCache: Map<string, PreciseLevels> | null = null;
let _preciseCodeMapExpires = 0;
const PRECISE_CODE_MAP_TTL = 10 * 60 * 1000;

async function getPreciseCodeMap(pool: Pool): Promise<Map<string, PreciseLevels>> {
  if (_preciseCodeMapCache && Date.now() < _preciseCodeMapExpires) return _preciseCodeMapCache;
  try {
    const [rows] = await pool.query(`
      SELECT u5.code, u5.id AS l5, u4.id AS l4, u3.id AS l3, u2.id AS l2, u1.id AS l1
      FROM crm_unspsc_codes u5
      LEFT JOIN crm_unspsc_codes u4 ON u4.id = u5.parent_id
      LEFT JOIN crm_unspsc_codes u3 ON u3.id = u4.parent_id
      LEFT JOIN crm_unspsc_codes u2 ON u2.id = u3.parent_id
      LEFT JOIN crm_unspsc_codes u1 ON u1.id = u2.parent_id
      WHERE u5.level = 5
    `);
    _preciseCodeMapCache = buildCodeLevelMap(rows as RowDataPacket[]);
    _preciseCodeMapExpires = Date.now() + PRECISE_CODE_MAP_TTL;
  } catch {
    // 查询失败：使用旧缓存；无旧缓存则用空映射（调用方回退 legacy）
    if (_preciseCodeMapCache) return _preciseCodeMapCache;
    _preciseCodeMapCache = new Map();
    _preciseCodeMapExpires = Date.now() + PRECISE_CODE_MAP_TTL;
  }
  return _preciseCodeMapCache;
}

/**
 * 按 notice_id 批量加载 approved 精准码并解析为五级 id。
 * 返回结构与 loadUnspscByNoticeIds 一致；无精准码的公告不在结果中。
 */
export async function loadPreciseByNoticeIds(
  pool: Pool,
  noticeIds: string[],
): Promise<Map<string, Record<string, string>>> {
  if (noticeIds.length === 0) return new Map();

  const placeholders = noticeIds.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT opp.source_notice_id AS notice_id, c.candidate_code
     FROM crm_bid_opportunities opp
     JOIN crm_bid_opportunity_unspsc_candidates c
       ON c.opportunity_id = opp.id AND c.status = 'approved'
     WHERE opp.source_notice_id IN (${placeholders})`,
    noticeIds,
  );

  const codeMap = await getPreciseCodeMap(pool);
  const merged = new Map<string, {
    level1: Set<string>; level2: Set<string>; level3: Set<string>;
    level4: Set<string>; level5: Set<string>;
  }>();

  for (const row of rows as RowDataPacket[]) {
    const nid = String(row.notice_id);
    const levels = codeMap.get(String(row.candidate_code || "").trim());
    if (!levels) continue; // 码不在字典：跳过（该公告回退 legacy）
    if (!merged.has(nid)) {
      merged.set(nid, {
        level1: new Set(), level2: new Set(), level3: new Set(),
        level4: new Set(), level5: new Set(),
      });
    }
    const entry = merged.get(nid)!;
    if (levels.level1) entry.level1.add(levels.level1);
    if (levels.level2) entry.level2.add(levels.level2);
    if (levels.level3) entry.level3.add(levels.level3);
    if (levels.level4) entry.level4.add(levels.level4);
    if (levels.level5) entry.level5.add(levels.level5);
  }

  const final = new Map<string, Record<string, string>>();
  for (const [nid, entry] of merged) {
    final.set(nid, {
      level1: Array.from(entry.level1).join(","),
      level2: Array.from(entry.level2).join(","),
      level3: Array.from(entry.level3).join(","),
      level4: Array.from(entry.level4).join(","),
      level5: Array.from(entry.level5).join(","),
    });
  }
  return final;
}

// ── 受援助国标准化：逐个翻译为中文 ──
function normalizeBeneficiaryCountries(raw: string): string {
  if (!raw) return "";
  const parts = raw.split(",").map(s => s.trim()).filter(Boolean);
  const translated = parts.map(name => {
    const canonical = normalizeCountry(name); // 归一化为英文标准名
    return COUNTRY_NAME_ZH[canonical] || canonical; // 查中文名，未命中保留英文
  }).filter(Boolean);
  return translated.join(", ").slice(0, 300);
}

// ── 宽表行构建 ──
export function buildWideRow(
  r: any,
  aliasMap: Map<string, string>,
  unspsc?: Record<string, string>,
  translations?: Record<string, { title: string; description: string }>,
  precise?: Record<string, string>,
): Record<string, any> {
  const agency = String(r.agency || "").trim();
  // 共享 normalizeCountry 始终返回英文标准名（含子国家归并、脏数据清理）
  const countryStd = normalizeCountry(String(r.country || "")).slice(0, 100);

  const agencyStd = (agency ? (aliasMap.get(agency.toUpperCase()) || agency) : "").slice(0, 200);
  const typeInfo = agencyStd && countryStd ? classifyAgencyType(agencyStd, countryStd) : null;
  const agencyGroup = (typeInfo?.typeKey || "").slice(0, 100);
  const noticeTypeStd = normalizeNoticeType(r.notice_type).slice(0, 20);
  const docs = normalizeDocumentRows(r.documents, r.procurement_files);
  // 修复 030：宽表 deadline_sec 已扩容为 BIGINT UNSIGNED，不再需要 INT UNSIGNED 截断。
  // 仅保留 NaN / 负值保护（防御主表生成列异常值）。
  const rawDeadline = r.deadline_sec ? Number(r.deadline_sec) : 0;
  const deadlineSec = isNaN(rawDeadline) || rawDeadline < 0 ? 0 : rawDeadline;

  // 构建多语言翻译字段
  // PERF: 所有 description_* 截断到 2000 字符，与 TEXT 列类型的实际使用上限对齐
  // 避免存储过长内容，确保查询性能
  const langFields: Record<string, string> = {};
  for (const lang of SUPPORTED_LANGS) {
    const tr = translations?.[lang];
    // 精选公告的中文使用人工拆解的 description_cn
    if (lang === "zh" && r.is_featured && r.description_cn) {
      langFields[`title_${lang}`] = String(tr?.title || "").slice(0, 1000);
      langFields[`description_${lang}`] = String(r.description_cn || "").slice(0, 2000);
    } else {
      langFields[`title_${lang}`] = String(tr?.title || "").slice(0, 1000);
      langFields[`description_${lang}`] = String(tr?.description || "").slice(0, 2000);
    }
  }

  return {
    id: Number(r.id),
    notice_id: String(r.notice_id || "").slice(0, 100),
    title: String(r.title || "").slice(0, 1000),
    reference: String(r.reference || "").slice(0, 200),
    description: String(r.description || "").slice(0, 2000),
    ...langFields,
    country_std: countryStd,
    agency_std: agencyStd,
    agency_group: agencyGroup,
    notice_type_std: noticeTypeStd,
    deadline_sec: deadlineSec,
    estimated_value: parseDecimalValue(r.estimated_value),
    is_featured: r.is_featured ? 1 : 0,
    unspsc_level1: (unspsc?.level1 || "").slice(0, 2000),
    unspsc_level2: (unspsc?.level2 || "").slice(0, 2000),
    unspsc_level3: (unspsc?.level3 || "").slice(0, 2000),
    unspsc_level4: (unspsc?.level4 || "").slice(0, 2000),
    unspsc_level5: (unspsc?.level5 || "").slice(0, 2000),
    // 精准码列：仅存 approved 精准码，不回填原标签（mode=prefs 专用，无精准码则不匹配）
    precise_level1: (precise?.level1 || "").slice(0, 2000),
    precise_level2: (precise?.level2 || "").slice(0, 2000),
    precise_level3: (precise?.level3 || "").slice(0, 2000),
    precise_level4: (precise?.level4 || "").slice(0, 2000),
    precise_level5: (precise?.level5 || "").slice(0, 2000),
    description_cn: String(r.description_cn || "").slice(0, 500),
    bid_overview: String(r.bid_overview || "").slice(0, 200),
    beneficiary_countries: normalizeBeneficiaryCountries(String(r.beneficiary_countries || "")),
    documents_count: docs.length,
  };
}

// ── 机构别名映射加载（带 10 分钟缓存，避免每 10 秒增量同步都查全表）──
let _aliasMapCache: Map<string, string> | null = null;
let _aliasMapExpires = 0;
const ALIAS_MAP_TTL = 10 * 60 * 1000; // 10 分钟

export async function loadAliasMap(pool: Pool): Promise<Map<string, string>> {
  if (_aliasMapCache && Date.now() < _aliasMapExpires) return _aliasMapCache;
  const aliasMap = new Map<string, string>();
  try {
    const [rows] = await pool.query("SELECT canonical, alias FROM crm_agency_aliases");
    for (const row of rows as RowDataPacket[]) {
      aliasMap.set(String(row.alias || "").trim().toUpperCase(), String(row.canonical || "").trim());
    }
    _aliasMapCache = aliasMap;
    _aliasMapExpires = Date.now() + ALIAS_MAP_TTL;
  } catch {
    // 表不存在或查询失败：静默降级，返回旧缓存（如果有）
    if (_aliasMapCache) return _aliasMapCache;
  }
  return aliasMap;
}

/**
 * deadline_sec 对账：检测主表与宽表之间的 deadline_sec 不一致并修复
 *
 * 解决问题：主表 deadline_sec 是 VIRTUAL 生成列（自动跟随 deadline 计算），
 * 宽表 deadline_sec 是普通列（静态拷贝）。当主表 deadline 变更时，
 * 宽表 deadline_sec 不会自动更新，导致已过期的记录被误判为"无截止日期"(0)。
 *
 * [修复 030]：宽表 deadline_sec 已扩容为 BIGINT UNSIGNED，不再需要 INT UNSIGNED
 * 溢出截断。仅保留负值保护（GREATEST(..., 0)），防止主表生成列异常负值传入。
 *
 * 对账逻辑：循环检测并修复不一致记录（每轮最多 5000 条，最多 10 轮），
 * 返回所有变更 ID 供上层同步到 Meilisearch。
 */
export async function reconcileDeadlineSec(pool: Pool): Promise<number[]> {
  const allIds: number[] = [];
  const MAX_ROUNDS = 10;
  // [修复 030]：宽表已扩容为 BIGINT UNSIGNED，直接使用主表值，
  // 仅用 GREATEST 保护负值（防御主表生成列异常）。
  const SAFE_EXPR = `GREATEST(COALESCE(n.deadline_sec, 0), 0)`;
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      // 检测宽表 deadline_sec 与主表不一致的记录
      const [mismatchRows] = await pool.query(
        `SELECT n.id, ${SAFE_EXPR} AS deadline_sec
         FROM crm_bid_notices n
         INNER JOIN crm_notice_search ns ON ns.id = n.id
         WHERE ns.deadline_sec != ${SAFE_EXPR}
         LIMIT 5000`,
      );
      const mismatches = mismatchRows as RowDataPacket[];
      if (mismatches.length === 0) break;

      const ids = mismatches.map(r => Number(r.id));
      allIds.push(...ids);
      const BATCH = 1000;
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const ph = batch.map(() => "?").join(",");
        await pool.query(
          `UPDATE crm_notice_search ns
           INNER JOIN crm_bid_notices n ON n.id = ns.id
           SET ns.deadline_sec = ${SAFE_EXPR}
           WHERE ns.id IN (${ph})`,
          batch,
        );
      }
      if (mismatches.length < 5000) break;
    }
    if (allIds.length > 0) {
      reconcileLog("deadline", allIds.length, `[wide-table] deadline_sec 对账修复 ${allIds.length} 条不一致记录`);
    }
    return allIds;
  } catch (e) {
    console.warn(`[wide-table] deadline_sec 对账失败（静默降级）:`, (e as Error).message);
    return allIds;
  }
}

/**
 * Ghost 行清理：删除宽表中主表已不存在的记录
 *
 * 解决问题：增量同步只处理 id > watermark 的新记录，不会处理删除操作。
 * 当主表删除记录时，宽表不会同步删除，导致 ghost 行残留。
 *
 * 对账逻辑：每轮删除最多 5000 条 ghost 行，最多 10 轮，
 * 返回所有删除的 ID 供上层同步到 Meilisearch。
 */
export async function reconcileGhostRows(pool: Pool): Promise<number[]> {
  const allDeletedIds: number[] = [];
  const MAX_ROUNDS = 10;
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      // 查找宽表中主表已不存在的记录（ghost 行）
      const [ghostRows] = await pool.query(
        `SELECT ns.id FROM crm_notice_search ns
         LEFT JOIN crm_bid_notices n ON n.id = ns.id
         WHERE n.id IS NULL
         LIMIT 5000`,
      );
      const ghosts = ghostRows as RowDataPacket[];
      if (ghosts.length === 0) break;

      const ids = ghosts.map(r => Number(r.id));
      allDeletedIds.push(...ids);
      const BATCH = 1000;
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const ph = batch.map(() => "?").join(",");
        await pool.query(`DELETE FROM crm_notice_search WHERE id IN (${ph})`, batch);
      }
      if (ghosts.length < 5000) break;
    }
    if (allDeletedIds.length > 0) {
      console.log(`[wide-table] ghost 行清理: 删除 ${allDeletedIds.length} 条主表已不存在的记录`);
    }
    return allDeletedIds;
  } catch (e) {
    console.warn(`[wide-table] ghost 行清理失败（静默降级）:`, (e as Error).message);
    return allDeletedIds;
  }
}

/**
 * is_featured 对账：同步主表的 is_featured 状态到宽表
 *
 * 解决问题：主表 is_featured 由精选标注任务更新，宽表 is_featured 是静态拷贝。
 * 当主表 is_featured 变更时，宽表不会自动更新。
 *
 * 对账逻辑：循环检测并修复不一致记录（每轮最多 5000 条，最多 10 轮），
 * 返回所有变更 ID 供上层同步到 Meilisearch。
 */
export async function reconcileIsFeatured(pool: Pool): Promise<number[]> {
  const allIds: number[] = [];
  const MAX_ROUNDS = 10;
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      // 检测宽表 is_featured 与主表不一致的记录
      const [mismatchRows] = await pool.query(
        `SELECT n.id, n.is_featured
         FROM crm_bid_notices n
         INNER JOIN crm_notice_search ns ON ns.id = n.id
         WHERE ns.is_featured != n.is_featured
         LIMIT 5000`,
      );
      const mismatches = mismatchRows as RowDataPacket[];
      if (mismatches.length === 0) break;

      const ids = mismatches.map(r => Number(r.id));
      allIds.push(...ids);
      const BATCH = 1000;
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const ph = batch.map(() => "?").join(",");
        await pool.query(
          `UPDATE crm_notice_search ns
           INNER JOIN crm_bid_notices n ON n.id = ns.id
           SET ns.is_featured = n.is_featured
           WHERE ns.id IN (${ph})`,
          batch,
        );
      }
      if (mismatches.length < 5000) break;
    }
    if (allIds.length > 0) {
      reconcileLog("featured", allIds.length, `[wide-table] is_featured 对账修复 ${allIds.length} 条不一致记录`);
    }
    return allIds;
  } catch (e) {
    console.warn(`[wide-table] is_featured 对账失败（静默降级）:`, (e as Error).message);
    return allIds;
  }
}

/**
 * 译文对账：检测宽表 title_zh 与翻译表 title_tr（lang='zh'）不一致的行。
 * 修复"译文已入 crm_notice_translations 但宽表/索引滞后"的断链场景。
 * 检测后直接 UPDATE 宽表，避免下轮对账重复检测。
 * 每轮抽样上限 200 条，返回需重新同步的公告 ID。
 */
export async function reconcileTranslations(pool: Pool): Promise<number[]> {
  try {
    const [mismatchRows] = await pool.query(
      `SELECT ns.id
       FROM crm_notice_search ns
       INNER JOIN crm_notice_translations t
         ON t.notice_id = ns.id AND t.lang = 'zh'
       WHERE NOT (COALESCE(ns.title_zh, '') = COALESCE(t.title_tr, ''))
       LIMIT 200`,
    );
    const ids = (mismatchRows as any[]).map((r) => Number(r.id)).filter(Boolean);
    if (ids.length > 0) {
      // 修复宽表：将翻译表的 title_tr / description_tr 写回宽表
      const BATCH = 100;
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const ph = batch.map(() => "?").join(",");
        await pool.query(
          `UPDATE crm_notice_search ns
           INNER JOIN crm_notice_translations t
             ON t.notice_id = ns.id AND t.lang = 'zh'
           SET ns.title_zh = LEFT(COALESCE(t.title_tr, ''), 1000),
               ns.description_zh = LEFT(COALESCE(t.description_tr, ''), 2000)
           WHERE ns.id IN (${ph})`,
          batch,
        );
      }
      reconcileLog("translation", ids.length, `[wide-table] 译文对账修复 ${ids.length} 条 title_zh 滞后记录`);
    }
    return ids;
  } catch (e) {
    console.warn(`[wide-table] 译文对账失败（静默降级）:`, (e as Error).message);
    return [];
  }
}

/**
 * precise 对账：检测宽表精准码与 candidates 表实际状态之间的差异。
 *
 * [修复] 原实现每次返回全部"有 approved 候选码的公告"ID（上限 2000），
 * 导致每 5 分钟触发 ~2000 条无效级联同步（宽表重写 + Meilisearch 更新），
 * 即使精准码未发生任何变化。
 *
 * 改为变更感知：比较宽表 precise_level1 与当前 approved 候选码的聚合值，
 * 仅返回实际存在差异的记录 ID。检测后直接将聚合值写回宽表，
 * 避免下轮对账重复检测。
 */
export async function reconcilePreciseCodes(pool: Pool): Promise<number[]> {
  try {
    // 比较宽表 precise_level1 与当前 approved 候选码的聚合值
    // 候选码以逗号分隔存储，GROUP_CONCAT 聚合后与宽表值对比
    const [rows] = await pool.query(`
      SELECT n.id, n.notice_id,
             ns.precise_level1 AS wide_val,
             (SELECT GROUP_CONCAT(DISTINCT c2.candidate_code ORDER BY c2.candidate_code SEPARATOR ',')
              FROM crm_bid_opportunities o2
              JOIN crm_bid_opportunity_unspsc_candidates c2
                ON c2.opportunity_id = o2.id AND c2.status = 'approved'
              WHERE o2.source_notice_id = n.notice_id
             ) AS expected_val
      FROM crm_bid_notices n
      INNER JOIN crm_notice_search ns ON ns.id = n.id
      WHERE EXISTS (
        SELECT 1 FROM crm_bid_opportunities o
        JOIN crm_bid_opportunity_unspsc_candidates c
          ON c.opportunity_id = o.id AND c.status = 'approved'
        WHERE o.source_notice_id = n.notice_id
      )
      HAVING NOT (
        (wide_val IS NULL AND expected_val IS NULL)
        OR (wide_val IS NOT NULL AND expected_val IS NOT NULL AND wide_val = expected_val)
      )
      LIMIT 2000
    `);
    const ids = (rows as RowDataPacket[]).map((r) => Number(r.id)).filter(Boolean);
    if (ids.length > 0) {
      // 修复宽表：将聚合后的精准码写回 precise_level1
      const BATCH = 100;
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const ph = batch.map(() => "?").join(",");
        await pool.query(
          `UPDATE crm_notice_search ns
           INNER JOIN crm_bid_notices n ON n.id = ns.id
           SET ns.precise_level1 = (
             SELECT GROUP_CONCAT(DISTINCT c2.candidate_code ORDER BY c2.candidate_code SEPARATOR ',')
             FROM crm_bid_opportunities o2
             JOIN crm_bid_opportunity_unspsc_candidates c2
               ON c2.opportunity_id = o2.id AND c2.status = 'approved'
             WHERE o2.source_notice_id = n.notice_id
           )
           WHERE ns.id IN (${ph})`,
          batch,
        );
      }
      reconcileLog("precise", ids.length, `[wide-table] precise 对账修复 ${ids.length} 条精准码实际变更`);
    }
    return ids;
  } catch (e) {
    console.warn(`[wide-table] precise 对账失败（静默降级）:`, (e as Error).message);
    return [];
  }
}

/**
 * 内容漂移对账：检测主表 title/description 变更后宽表滞后的记录并修复
 *
 * 解决问题：增量同步只处理 id > watermark 的新行，主表已有行的 title/description
 * 被外部数据管道更新后，宽表不会同步更新，导致搜索结果显示过期内容。
 * 与 deadline_sec/is_featured 等单字段对账不同，本函数覆盖 title + description
 * 两个核心搜索字段，确保搜索索引与主表内容一致。
 *
 * 检测策略：由于 crm_bid_notices 是外部表，无 updated_at 列，
 * 采用 ID 范围分批扫描（每批 1000 条），比较内容差异并修复。
 * 每轮上限 2000 条，返回变更 ID 供上层同步 Meilisearch。
 */
export async function reconcileContentDrift(pool: Pool): Promise<number[]> {
  try {
    // 获取宽表中最大的 ID，作为扫描范围上限
    const [maxIdRows] = await pool.query(`
      SELECT COALESCE(MAX(id), 0) as max_id FROM crm_notice_search
    `);
    const maxId = Number((maxIdRows as RowDataPacket[])[0]?.max_id || 0);
    if (maxId === 0) return [];

    // 分批扫描：从 ID 1 开始，每批 1000 条，最多扫描 2 批（2000 条）
    const BATCH_SIZE = 1000;
    const MAX_BATCHES = 2;
    const allChangedIds: number[] = [];

    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const startId = batch * BATCH_SIZE + 1;
      const endId = startId + BATCH_SIZE - 1;

      const [rows] = await pool.query(`
        SELECT n.id
        FROM crm_bid_notices n
        INNER JOIN crm_notice_search ns ON ns.id = n.id
        WHERE n.id BETWEEN ? AND ?
          AND (
            ns.title != LEFT(n.title, 1000)
            OR ns.description != LEFT(n.description, 2000)
            OR ns.reference != LEFT(n.reference, 200)
          )
        LIMIT 2000
      `, [startId, endId]);

      const ids = (rows as RowDataPacket[]).map((r) => Number(r.id)).filter(Boolean);
      allChangedIds.push(...ids);

      // 如果本批未找到变更记录且未达到最大 ID，继续下一批
      if (ids.length === 0 && endId < maxId) continue;
      // 如果已找到变更记录或已达到最大 ID，停止扫描
      if (ids.length > 0 || endId >= maxId) break;
    }

    if (allChangedIds.length > 0) {
      // 批量修复：将主表 title/description/reference 同步到宽表
      const FIX_BATCH = 500;
      for (let i = 0; i < allChangedIds.length; i += FIX_BATCH) {
        const batchIds = allChangedIds.slice(i, i + FIX_BATCH);
        const ph = batchIds.map(() => "?").join(",");
        await pool.query(
          `UPDATE crm_notice_search ns
           INNER JOIN crm_bid_notices n ON n.id = ns.id
           SET ns.title = LEFT(n.title, 1000),
               ns.description = LEFT(n.description, 2000),
               ns.reference = LEFT(n.reference, 200)
           WHERE ns.id IN (${ph})`,
          batchIds,
        );
      }
      reconcileLog("content_drift", allChangedIds.length, `[wide-table] 内容漂移对账修复 ${allChangedIds.length} 条 title/description 滞后记录`);
    }
    return allChangedIds;
  } catch (e) {
    console.warn(`[wide-table] 内容漂移对账失败（静默降级）:`, (e as Error).message);
    return [];
  }
}

// ── 批量写入宽表 ──
export async function upsertWideRows(pool: Pool, rows: Record<string, any>[]): Promise<number> {
  if (rows.length === 0) return 0;
  const BATCH = 500;
  let totalSynced = 0;

  // 构建语言字段列表
  const langColumns = SUPPORTED_LANGS.flatMap(lang => [`title_${lang}`, `description_${lang}`]);
  const allColumns = [
    "id", "notice_id", "title", "reference", "description",
    ...langColumns,
    "country_std", "agency_std", "agency_group", "notice_type_std",
    "deadline_sec", "estimated_value", "is_featured",
    "unspsc_level1", "unspsc_level2", "unspsc_level3", "unspsc_level4", "unspsc_level5",
    "precise_level1", "precise_level2", "precise_level3", "precise_level4", "precise_level5",
    "description_cn", "bid_overview", "beneficiary_countries", "documents_count",
  ];
  
  const placeholders = allColumns.map(() => "?").join(", ");
  const updateColumns = allColumns.filter(c => c !== "id").map(c => `${c}=VALUES(${c})`).join(", ");

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const batchPlaceholders = batch.map(() => `(${placeholders})`).join(",");
    const params: any[] = [];
    for (const row of batch) {
      params.push(
        row.id, row.notice_id, row.title, row.reference, row.description,
        ...SUPPORTED_LANGS.flatMap(lang => [row[`title_${lang}`], row[`description_${lang}`]]),
        row.country_std, row.agency_std, row.agency_group, row.notice_type_std,
        row.deadline_sec, row.estimated_value, row.is_featured,
        row.unspsc_level1, row.unspsc_level2, row.unspsc_level3, row.unspsc_level4, row.unspsc_level5,
        row.precise_level1, row.precise_level2, row.precise_level3, row.precise_level4, row.precise_level5,
        row.description_cn, row.bid_overview, row.beneficiary_countries, row.documents_count,
      );
    }
    await pool.query(
      `INSERT INTO crm_notice_search (${allColumns.join(", ")}) VALUES ${batchPlaceholders}
      ON DUPLICATE KEY UPDATE ${updateColumns}`,
      params,
    );
    totalSynced += batch.length;
  }
  return totalSynced;
}
