/**
 * 统一搜索编排器 — 筛选条件构建器（全系统唯一筛选语义实现点）
 * Unified search orchestrator — filter builder (single source of truth for filter semantics)
 *
 * @module server/services/search-orchestrator/filter-builder
 * @description 每个筛选条件同时输出 Meilisearch filter 与 MySQL WHERE 两种方言，
 *              从根源上杜绝双轨语义漂移（历史 BUG：deadlineWithinDays / countryVariants
 *              在两条路径实现不一致）。对应重构方案 §3.4。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { UnifiedSearchParams, FilterPlan } from "./types";
import { expandCountryAllForms, expandCountryAliases } from "../notice-search/countries";
import { getAgencyCacheData } from "../notice-search/agencies";
import { normalizeNoticeType, toBeijingUnixTs } from "../meilisearch/index";

/** 转义 Meilisearch filter 字符串中的双引号和反斜杠 */
function escapeFilter(value: string): string {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// ── 采购类型全集缓存（MySQL 方言归一化匹配用）──
let _noticeTypesCache: { types: string[]; expires: number } | null = null;
const NOTICE_TYPES_TTL = 10 * 60 * 1000;

async function getAllNoticeTypes(pool: Pool): Promise<string[]> {
  if (_noticeTypesCache && _noticeTypesCache.expires > Date.now()) return _noticeTypesCache.types;
  try {
    const [rows] = await pool.query(
      "SELECT DISTINCT notice_type FROM crm_bid_notices WHERE notice_type IS NOT NULL AND notice_type != '' LIMIT 500",
    );
    const types = (rows as RowDataPacket[]).map((r) => String(r.notice_type));
    _noticeTypesCache = { types, expires: Date.now() + NOTICE_TYPES_TTL };
    return types;
  } catch {
    return [];
  }
}

/** 机构扩展解析结果（两种方言共用） */
interface AgencyExpansion {
  meiliAgencyGroup?: string;
  meiliAgencies?: string[];
  /** MySQL 方言机构子句 */
  mysqlClause: string;
  mysqlParams: unknown[];
  /** FORCE_COUNTRY 强制国家（机构隐含国家归属） */
  forceCountry?: string;
  /** sqlPattern 类机构：Meilisearch 无法 LIKE，主路径退化为精确匹配标记 */
  hasSqlPattern: boolean;
}

/** 解析机构缓存扩展（FORCE_COUNTRY / sqlPattern / originalAgencies） */
function expandAgency(agency: string): AgencyExpansion {
  const items = getAgencyCacheData() || [];
  const cached = items.find((item) => item.agency === agency);

  if (cached?.agencyGroup?.startsWith("FORCE_COUNTRY_")) {
    const forceCountry = cached.agencyGroup.slice(14);
    const variants = expandCountryAliases(forceCountry);
    if (variants.length > 1) {
      return {
        forceCountry,
        hasSqlPattern: false,
        mysqlClause: `UPPER(n.country) IN (${variants.map(() => "?").join(",")})`,
        mysqlParams: variants.map((c) => c.toUpperCase()),
      };
    }
    return {
      forceCountry,
      hasSqlPattern: false,
      mysqlClause: "UPPER(n.country) = ?",
      mysqlParams: [forceCountry.toUpperCase()],
    };
  }
  if (cached?.sqlPattern) {
    return {
      hasSqlPattern: true,
      meiliAgencies: [agency], // Meilisearch 无法 LIKE：退化精确匹配（文档已记录限制）
      mysqlClause: "UPPER(n.agency) LIKE ?",
      mysqlParams: [cached.sqlPattern],
    };
  }
  if (cached?.agencyGroup && !cached.agencyGroup.startsWith("ORPHAN_")) {
    // Meilisearch 用 agency_group 聚合字段；MySQL 主表无该列，用 originalAgencies 等价展开
    const originals = cached.originalAgencies && cached.originalAgencies.length > 0 ? cached.originalAgencies : [agency];
    return {
      hasSqlPattern: false,
      meiliAgencyGroup: cached.agencyGroup,
      mysqlClause: originals.length > 1
        ? `n.agency IN (${originals.map(() => "?").join(",")})`
        : "n.agency = ?",
      mysqlParams: [...originals],
    };
  }
  if (cached?.originalAgencies && cached.originalAgencies.length > 1) {
    return {
      hasSqlPattern: false,
      meiliAgencies: cached.originalAgencies,
      mysqlClause: `n.agency IN (${cached.originalAgencies.map(() => "?").join(",")})`,
      mysqlParams: [...cached.originalAgencies],
    };
  }
  if (cached?.originalAgencies?.length === 1) {
    return {
      hasSqlPattern: false,
      meiliAgencies: [cached.originalAgencies[0]],
      mysqlClause: "n.agency = ?",
      mysqlParams: [cached.originalAgencies[0]],
    };
  }
  return {
    hasSqlPattern: false,
    meiliAgencies: [agency],
    mysqlClause: "n.agency = ?",
    mysqlParams: [agency],
  };
}

/**
 * 构建双方言 filter 计划。
 * @param unspsc 可选 UNSPSC 过滤（level 1-5 + id）；prefs 渐进放宽由编排器逐层注入
 */
export async function buildFilterPlan(
  pool: Pool,
  p: UnifiedSearchParams,
  unspsc?: { level: number; id: string } | null,
): Promise<FilterPlan> {
  const meiliFilters: string[] = [];
  const mysqlWhere: string[] = [];
  const mysqlParams: unknown[] = [];
  const digestParts: string[] = [];

  // ── 机构扩展（需先于国家处理：FORCE_COUNTRY 覆盖国家）──
  let agencyExp: AgencyExpansion | null = null;
  let effectiveCountry = p.country;
  if (p.agency) {
    agencyExp = expandAgency(p.agency);
    if (agencyExp.forceCountry) {
      // FORCE_COUNTRY 与用户所选国家矛盾 → 空结果
      if (p.country && p.country.toUpperCase() !== agencyExp.forceCountry.toUpperCase()
        && !expandCountryAliases(agencyExp.forceCountry).some((v) => v.toUpperCase() === p.country.toUpperCase())) {
        return { meiliFilters: [], mysqlWhere: [], mysqlParams: [], conflictEmpty: true, digest: "FORCE_COUNTRY_CONFLICT" };
      }
      effectiveCountry = agencyExp.forceCountry;
    }
  }

  // ── 国家 ──
  if (effectiveCountry) {
    const variants = expandCountryAllForms(effectiveCountry);
    if (variants.length > 1) {
      const orParts = variants.map((v) => `country = "${escapeFilter(v)}"`).join(" OR ");
      meiliFilters.push(`(${orParts})`);
      mysqlWhere.push(`UPPER(n.country) IN (${variants.map(() => "?").join(",")})`);
      mysqlParams.push(...variants.map((v) => v.toUpperCase()));
    } else {
      meiliFilters.push(`country = "${escapeFilter(effectiveCountry)}"`);
      mysqlWhere.push("UPPER(n.country) = ?");
      mysqlParams.push(effectiveCountry.toUpperCase());
    }
    digestParts.push(`country:${effectiveCountry}`);
  }

  // ── 机构（FORCE_COUNTRY 机构已转为国家条件，不再叠加机构条件）──
  if (p.agency && agencyExp && !agencyExp.forceCountry) {
    if (agencyExp.meiliAgencyGroup) {
      meiliFilters.push(`agency_group = "${escapeFilter(agencyExp.meiliAgencyGroup)}"`);
    } else if (agencyExp.meiliAgencies && agencyExp.meiliAgencies.length > 1) {
      const orParts = agencyExp.meiliAgencies.map((o) => `agency = "${escapeFilter(o)}"`).join(" OR ");
      meiliFilters.push(`(${orParts})`);
    } else if (agencyExp.meiliAgencies?.length === 1) {
      meiliFilters.push(`agency = "${escapeFilter(agencyExp.meiliAgencies[0])}"`);
    }
    mysqlWhere.push(agencyExp.mysqlClause);
    mysqlParams.push(...agencyExp.mysqlParams);
    digestParts.push(`agency:${p.agency}`);
  }

  // ── 截止日期范围（deadlineFrom 自然排除 deadline_sec=0：0 < fromTs）──
  if (p.deadlineFrom) {
    const ts = toBeijingUnixTs(p.deadlineFrom, "00:00:00");
    meiliFilters.push(`deadline_sec >= ${ts}`);
    mysqlWhere.push("n.deadline_sec >= ?");
    mysqlParams.push(ts);
    digestParts.push(`from:${p.deadlineFrom}`);
  }
  if (p.deadlineTo) {
    const ts = toBeijingUnixTs(p.deadlineTo, "23:59:59");
    meiliFilters.push(`deadline_sec <= ${ts}`);
    mysqlWhere.push("n.deadline_sec <= ?");
    mysqlParams.push(ts);
    digestParts.push(`to:${p.deadlineTo}`);
  }
  // ── 全部截止期限（★ 双方言同语义：排除无截止日期文档）──
  if (p.deadlineWithinDays > 0) {
    const futureTs = Math.floor(Date.now() / 1000) + p.deadlineWithinDays * 86400;
    meiliFilters.push(`deadline_sec > 0 AND deadline_sec <= ${futureTs}`);
    mysqlWhere.push("n.deadline_ts IS NOT NULL AND n.deadline_sec <= ?");
    mysqlParams.push(futureTs);
    digestParts.push(`within:${p.deadlineWithinDays}d`);
  }

  // ── 采购类型 ──
  if (p.noticeType) {
    const normalized = normalizeNoticeType(p.noticeType);
    meiliFilters.push(`notice_type_normalized = "${escapeFilter(normalized)}"`);
    // MySQL 方言：归一化等价集合匹配（与旧 search-pipeline 行为一致）
    const allTypes = await getAllNoticeTypes(pool);
    const matching = allTypes.filter((t) => normalizeNoticeType(t) === normalized);
    if (matching.length > 0) {
      mysqlWhere.push(`n.notice_type IN (${matching.map(() => "?").join(",")})`);
      mysqlParams.push(...matching);
    } else {
      mysqlWhere.push("1 = 0");
    }
    digestParts.push(`type:${normalized}`);
  }

  // ── 精选 ──
  if (p.featuredOnly) {
    meiliFilters.push("is_featured = 1");
    mysqlWhere.push("n.is_featured = 1");
    digestParts.push("featured");
  }

  // ── UNSPSC 行业分类（level1~5 任意层级）──
  if (unspsc && unspsc.level >= 1 && unspsc.level <= 5 && unspsc.id) {
    meiliFilters.push(`level${unspsc.level}_id = "${escapeFilter(unspsc.id)}"`);
    mysqlWhere.push(`EXISTS (SELECT 1 FROM crm_bid_notice_unspsc_codes ub WHERE ub.notice_id = n.notice_id AND ub.level${unspsc.level}_id = ?)`);
    mysqlParams.push(unspsc.id);
    digestParts.push(`unspsc:L${unspsc.level}=${unspsc.id}`);
  }

  return {
    meiliFilters,
    mysqlWhere,
    mysqlParams,
    conflictEmpty: false,
    digest: digestParts.join(",") || "none",
  };
}
