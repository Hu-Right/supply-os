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
import { getAgencyCacheData } from "../notice-search/agencies/index";
// N7 收敛（2026-08-20）：normalizeNoticeType 直连 utils/notice-type 权威端口
import { normalizeNoticeType } from "../../utils/notice-type";
import { toBeijingUnixTs } from "../../utils/notice-expired";

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

// ── 品目大类 → 所辖 UNSPSC 段的旧字典 level=2 行 id 集合（10 分钟缓存）──
// 段→大类取 crm_commodity_group_segments（与常量 COMMODITY_GROUPS 由 CG5 门禁逐段比对），
// 段→id 取 crm_unspsc_codes level=2（实测 58 行，与归属表 58 段一一对应）；代码里不造数据。
let _groupSegIdsCache: { map: Map<string, string[]>; expires: number } | null = null;
const GROUP_SEG_TTL = 10 * 60 * 1000;

async function getGroupSegmentIds(pool: Pool): Promise<Map<string, string[]>> {
  if (_groupSegIdsCache && _groupSegIdsCache.expires > Date.now()) return _groupSegIdsCache.map;
  try {
    const [rows] = await pool.query(
      `SELECT s.group_code AS g, c.id AS id
         FROM crm_commodity_group_segments s
         JOIN crm_unspsc_codes c ON c.level = 2 AND LEFT(c.code, 2) = s.unspsc_prefix
        ORDER BY s.group_code, c.id`,
    );
    const map = new Map<string, string[]>();
    for (const r of rows as RowDataPacket[]) {
      const g = String(r.g);
      map.set(g, [...(map.get(g) ?? []), String(r.id)]);
    }
    _groupSegIdsCache = { map, expires: Date.now() + GROUP_SEG_TTL };
    return map;
  } catch {
    // 归属表/字典不可用：返回空图，上层按「大类挂不上段」走空结果（不静默放宽为全量）
    return new Map<string, string[]>();
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

/**
 * 生成机构 MySQL 子查询：通过宽表 agency_std 列匹配。
 *
 * 根因：mysqlFallback 查 crm_bid_notices（主表原始值），但缓存中的机构名
 * 是规范名（经别名映射/模式翻译），两者可能不同（如 "EU" vs "EUROPEAN UNION"）。
 * 改用宽表子查询确保匹配规范后的 agency_std 列（与 UNSPSC 端口一致）。
 */
function agencyStdSubquery(values: string[], useLike?: string): { mysqlClause: string; mysqlParams: unknown[] } {
  if (useLike) {
    return {
      mysqlClause: "EXISTS (SELECT 1 FROM crm_notice_search ns WHERE ns.id = n.id AND ns.agency_std LIKE ?)",
      mysqlParams: [useLike],
    };
  }
  if (values.length === 1) {
    return {
      mysqlClause: "EXISTS (SELECT 1 FROM crm_notice_search ns WHERE ns.id = n.id AND ns.agency_std = ?)",
      mysqlParams: [values[0]],
    };
  }
  return {
    mysqlClause: `EXISTS (SELECT 1 FROM crm_notice_search ns WHERE ns.id = n.id AND ns.agency_std IN (${values.map(() => "?").join(",")}))`,
    mysqlParams: [...values],
  };
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
        // [阶段0 T3] 去 UPPER() 包裹：utf8mb4_0900_ai_ci 本就大小写不敏感，
        // 函数作用于列会使 country/agency 索引全部失效（降级路径退化为全表扫描）
        mysqlClause: `n.country IN (${variants.map(() => "?").join(",")})`,
        mysqlParams: variants.map((c) => c.toUpperCase()),
      };
    }
    return {
      forceCountry,
      hasSqlPattern: false,
      mysqlClause: "n.country = ?",
      mysqlParams: [forceCountry.toUpperCase()],
    };
  }
  if (cached?.sqlPattern) {
    // Meilisearch: 用 agency_group 字段（存 typeKey）过滤
    // MySQL: 用宽表 agency_std LIKE 子查询（主表无 LIKE 规范名）
    return {
      hasSqlPattern: true,
      meiliAgencyGroup: cached.agencyGroup || agency,
      ...agencyStdSubquery([], cached.sqlPattern),
    };
  }
  if (cached?.agencyGroup && !cached.agencyGroup.startsWith("ORPHAN_")) {
    // Meilisearch 用 agency_group 聚合字段
    // MySQL 用宽表 agency_std 子查询（确保匹配规范名而非主表原始名）
    return {
      hasSqlPattern: false,
      meiliAgencyGroup: cached.agencyGroup,
      ...agencyStdSubquery(cached.originalAgencies?.length ? cached.originalAgencies : [agency]),
    };
  }
  if (cached?.originalAgencies && cached.originalAgencies.length > 0) {
    return {
      hasSqlPattern: false,
      meiliAgencies: cached.originalAgencies,
      ...agencyStdSubquery(cached.originalAgencies),
    };
  }
  return {
    hasSqlPattern: false,
    meiliAgencies: [agency],
    ...agencyStdSubquery([agency]),
  };
}

/**
 * 构建双方言 filter 计划。
 * @param unspsc 可选 UNSPSC 过滤（level 1-5 + id + precise）；
 *               precise=true 用 precise_level{N}_id（prefs 模式，approved 候选码）
 *               precise=false 用 level{N}_id（default 模式，TED 标签，覆盖全量公告）
 */
export async function buildFilterPlan(
  pool: Pool,
  p: UnifiedSearchParams,
  unspsc?: { level: number; id: string; precise: boolean } | null,
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
      // [阶段0 T3] 同 expandAgency：去 UPPER() 包裹，恢复索引可用性（collation 为 ai_ci）
      mysqlWhere.push(`n.country IN (${variants.map(() => "?").join(",")})`);
      mysqlParams.push(...variants.map((v) => v.toUpperCase()));
    } else {
      meiliFilters.push(`country = "${escapeFilter(effectiveCountry)}"`);
      mysqlWhere.push("n.country = ?");
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
    mysqlWhere.push("n.deadline_sec > 0 AND n.deadline_sec <= ?");
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
  // precise=true（prefs 模式）：使用 approved 精准码（precise_levelN_id），仅覆盖有人工审核候选码的公告
  // precise=false（default 模式）：使用 TED 标签（levelN_id），覆盖所有有行业标签的公告（~60%）
  if (unspsc && unspsc.level >= 1 && unspsc.level <= 5 && unspsc.id) {
    const col = unspsc.precise ? "precise_level" : "level";
    meiliFilters.push(`${col}${unspsc.level}_id = "${escapeFilter(unspsc.id)}"`);
    // [阶段0 T4] MySQL 方言列名与 Meilisearch 字段名分开拼接：宽表实际列名为
    // unspsc_level{N} / precise_level{N}（迁移 011/029，已对生产库核实），
    // 旧实现拼出的 level_level{N} 不存在 → EXISTS 子查询报错被 catch 吞掉 →
    // Meili 降级且带 UNSPSC 筛选时静默返回空结果
    const mysqlCol = unspsc.precise ? "precise_level" : "unspsc_level";
    // 类型兼容：unspsc.id 为 string（resolveUserIndustryProfile 归一化），
    // FIND_IN_SET 对参数隐式转字符串
    mysqlWhere.push(
      `EXISTS (SELECT 1 FROM crm_notice_search ns WHERE ns.id = n.id AND FIND_IN_SET(?, ns.${mysqlCol}${unspsc.level}))`,
    );
    mysqlParams.push(unspsc.id);
    digestParts.push(`unspsc:L${unspsc.level}=${unspsc.id}:${unspsc.precise ? "precise" : "ted"}`);
  }

  // ── 品目大类（32 类 chip，URL group=UGT-G-xx）──
  // 谓词 = 该大类所辖 UNSPSC 段的旧字典 level=2 行 id 的 OR 集合，落在宽表 unspsc_level2 / Meili level2_id。
  // 不读 group_codes 列：Meili 索引里没这个属性，两条方言必须同一谓词（本文件存在的意义）。
  // 与 group_codes 的等价性由 M3 双跑对账实测（2026-10-11，606,060 行零不一致，逐类命中数 Δ=0）。
  if (p.groupCode) {
    const ids = (await getGroupSegmentIds(pool)).get(p.groupCode) ?? [];
    if (ids.length === 0) {
      // 大类在库内挂不上任何 level=2 段行（常量与库漂移/新类未灌）：直接空结果，不静默放宽
      return {
        meiliFilters: [], mysqlWhere: [], mysqlParams: [], conflictEmpty: true,
        digest: `GROUP_NO_SEGMENT:${p.groupCode}`,
      };
    }
    meiliFilters.push(`(${ids.map((id) => `level2_id = "${escapeFilter(id)}"`).join(" OR ")})`);
    // OR 列表必须整体括起来：EXISTS 子查询里写成 `ns.id = n.id AND A OR B` 会被解析为
    // `(ns.id = n.id AND A) OR B`，B 不再与外层行相关 ⇒ EXISTS 对全表恒真，筛选静默失效
    // （2026-10-11 端到端实测：双段大类 UGT-G-14 降级路径返回 190,041 条未筛结果、
    // 首页 10 条全部不属于该类；单段大类无 OR 所以当时未暴露）
    mysqlWhere.push(
      `EXISTS (SELECT 1 FROM crm_notice_search ns WHERE ns.id = n.id AND (${ids.map(() => "FIND_IN_SET(?, ns.unspsc_level2)").join(" OR ")}))`,
    );
    mysqlParams.push(...ids);
    digestParts.push(`group:${p.groupCode}`);
  }

  // ── 品目树五级下拉（URL commodity=UNSPSC 数字前缀）──
  // 谓词 = 宽表 code_path 里等值存在该前缀项。code_path 是公告全部 8 位码的无损祖先前缀集
  // （lib/services/commodity/path.ts），所以选到哪一层就命中哪一层，运行期不需层级判断。
  // 为何不沿用上面的 levelN_id：旧字典 crm_unspsc_codes 只镜像了 UNSPSC 的一部分
  // （品目层 10,661 行 vs 品目树 150,006 节点），不在字典里的码根本进不了 unspsc_levelN 列，
  // 用它们筛会静默漏掉那部分公告。实测两边对在字典里的码命中数完全相等
  // （2772 / 555 / 227 / 11，temp/probe54），即 code_path 是严格超集。
  // Meili 侧需索引有 commodity_prefix 属性（sync.ts 由 code_path 拆数组）；
  // 索引未重灌前该属性不存在，Meili 会报未知属性错并整体降级到下面的 MySQL 方言（结果仍正确）。
  if (p.commodityPath) {
    meiliFilters.push(`commodity_prefix = "${escapeFilter(p.commodityPath)}"`);
    mysqlWhere.push(
      `EXISTS (SELECT 1 FROM crm_notice_search ns WHERE ns.id = n.id AND FIND_IN_SET(?, ns.code_path))`,
    );
    mysqlParams.push(p.commodityPath);
    digestParts.push(`commodity:${p.commodityPath}`);
  }

  // ── 行业墙强制一级类目（industry-scope 注入，客户端不可传）──
  // 与用户自选 codeId 叠加 AND：被墙用户即使在 URL 里换类目/翻页，也翻不出订阅行业外；
  // fixed（levelN_id，TED 标签覆盖全量）而非 precise——墙是数据口径，不依赖人工审核候选码。
  if (p.forcedLevel1Id) {
    meiliFilters.push(`level1_id = "${escapeFilter(p.forcedLevel1Id)}"`);
    mysqlWhere.push(
      `EXISTS (SELECT 1 FROM crm_notice_search ns WHERE ns.id = n.id AND FIND_IN_SET(?, ns.unspsc_level1))`,
    );
    mysqlParams.push(p.forcedLevel1Id);
    digestParts.push(`wall:L1=${p.forcedLevel1Id}`);
  }

  // ── 预算范围（estimated_value 为 VARCHAR 存数值字符串，CAST 为 DECIMAL 比较）──
  if (p.budgetMin != null || p.budgetMax != null) {
    if (p.budgetMin != null) {
      meiliFilters.push(`estimated_value_num >= ${p.budgetMin}`);
      mysqlWhere.push("CAST(n.estimated_value AS DECIMAL(20,2)) >= ?");
      mysqlParams.push(p.budgetMin);
      digestParts.push(`budgetMin:${p.budgetMin}`);
    }
    if (p.budgetMax != null) {
      meiliFilters.push(`estimated_value_num <= ${p.budgetMax}`);
      mysqlWhere.push("CAST(n.estimated_value AS DECIMAL(20,2)) <= ?");
      mysqlParams.push(p.budgetMax);
      digestParts.push(`budgetMax:${p.budgetMax}`);
    }
  }

  return {
    meiliFilters,
    mysqlWhere,
    mysqlParams,
    conflictEmpty: false,
    digest: digestParts.join(",") || "none",
  };
}
