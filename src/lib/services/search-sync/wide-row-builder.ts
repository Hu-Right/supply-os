/**
 * 宽表行构建器 + 数据加载
 * Wide Row Builder & Data Loading
 *
 * @module server/services/search-sync/wide-row-builder
 * @description 负责 crm_notice_search 宽表的数据加载、行构建、deadline 对账和批量写入。
 *              与 sync-scheduler.ts（调度层）分离，实现数据构建与同步时机的解耦。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { normalizeDocumentRows } from "../../utils/normalize";
import { normalizeNoticeType } from "../../utils/notice-type";
import { classifyAgencyType } from "../agency/index";
import { COUNTRY_NAME_ZH } from "../../data/countryNames";
import { normalizeCountry } from "../../utils/countryNormalize";

// ── 支持的语言列表 ──
export const SUPPORTED_LANGS = ["zh", "en", "fr", "ru", "es", "ar"];

// ── 对账逻辑已拆至 wide-row-reconcile.ts ──

// ── 批量写入宽表 ──

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
  // LEFT JOIN 原始公告表：当 model = 'skip-same-lang' 时，原文即目标语言，
  // 用原始标题/内容填充宽表对应语言字段，避免 title_en 等字段留空。
  const [rows] = await pool.query(
    `SELECT t.notice_id, t.lang, t.title_tr, t.description_tr, t.model,
            n.title AS orig_title, LEFT(n.description, 2000) AS orig_desc
     FROM crm_notice_translations t
     LEFT JOIN crm_bid_notices n ON n.id = t.notice_id
     WHERE t.notice_id IN (${placeholders})`,
    noticeIds,
  );
  
  for (const row of rows as RowDataPacket[]) {
    const nid = Number(row.notice_id);
    if (!result.has(nid)) result.set(nid, {});
    const entry = result.get(nid)!;
    const isSkipSameLang = String(row.model || "") === "skip-same-lang";
    entry[String(row.lang)] = {
      title: isSkipSameLang
        ? String(row.orig_title || row.title_tr || "")
        : String(row.title_tr || ""),
      description: isSkipSameLang
        ? String(row.orig_desc || row.description_tr || "")
        : String(row.description_tr || ""),
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
